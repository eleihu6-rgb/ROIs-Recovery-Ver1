#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>
#include <vector>
#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "utils/DutyUtils.h"
#include "StringUtil.h"

static RULE_VIOLATION* generateViolation2125(const DBRule* singleRule, int minRest, int actRest, string crewId, long long rosterId, long long pairingId, time_t startUtc, time_t endUtc);


//1. 检查crew身上是否存在2125违规
//2. 为避免重复计算不重算fdp, 要求调用前已经刷新计算过duty.fdp
//3. RO/PO无需执行
bool LegalityChecker::checkRest2125(RULE_LEGALITY * pCrew, const DBRule* singleRule) {
	if (!pCrew || !singleRule) {
		return true;
	}
	if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER) {
		return true;
	}
	shared_ptr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	if (!crew || crew->rosterList.empty()) {
		return true;
	}

	rule2124 * cache = (rule2124*)singleRule->parsedParam.get();

	for (int i = 0; i < (int)crew->rosterList.size() - 1; i++) {
		auto& prevRoster = crew->rosterList[i];
		auto& nextRoster = crew->rosterList[i + 1];
		if (prevRoster&&nextRoster){
			if (isAssignmentMrtOveride(prevRoster->duty, nextRoster->duty)){
				continue;
			}
		}
		Pairing* pairing = NULL;
		if (prevRoster->pairId != 0 && _dbData->pairingIdMap.find(prevRoster->pairId) != _dbData->pairingIdMap.end()) {
			pairing = _dbData->pairingIdMap[prevRoster->pairId];
		}
		if (pairing) {
			for (std::size_t j = 0; j < pairing->getNumDuties(); j++) {
				Duty* duty = pairing->getDuty(j);
				if (!checkRest2125MatchRuleParam(duty, singleRule)) {
					continue;//not match ruleParam
				}
				//act rest
				int actRestMinutes = 0;
				time_t restStartUtc = 0, restEndUtc = 0;
				if (j < pairing->getNumDuties() - 1) {
					//duty之间
					Duty* nextDuty = pairing->getDuty(j + 1);
					actRestMinutes = static_cast<int>(nextDuty->getStartTimeUtcAct() - duty->getEndTimeUtcAct()) / 60;
					restStartUtc = duty->getEndTimeUtcAct();
					restEndUtc = nextDuty->getStartTimeUtcAct();
				}
				else {
					//末尾duty到下一roster
					actRestMinutes = static_cast<int>(nextRoster->getStartTimeUtcAct() - duty->getEndTimeUtcAct()) / 60;
					restStartUtc = duty->getEndTimeUtcAct();
					restEndUtc = nextRoster->getStartTimeUtcAct();
				}

				//compare
				if (actRestMinutes < cache->minRest) {
					//20191017 ain, mantis#6893, 2125中单独判断是否符合8107, 符合8107则忽略不警告，不符合8107才警告
					//if (! isRosterMatch8107(prevRoster, nextRoster, _dbData.get())) {
					//20191017 ain, mantis#6893, 问题3, 增加字段标记是否与后续mergeFdp
					if (!prevRoster->isMergeFdpWithNext) {
						RULE_VIOLATION* rv = generateViolation2125(singleRule, cache->minRest, actRestMinutes, crew->idCrew, prevRoster->rosterId, prevRoster->pairId, restStartUtc, restEndUtc);
						if (rv) {
							this->addRuleViolations(rv, singleRule);
						}
					}
				}
			}
		}
	}

	return true;
}

static RULE_VIOLATION* generateViolation2125(const DBRule* singleRule, int minRest, int actRest, string crewId, long long rosterId, long long pairingId, time_t startUtc, time_t endUtc) {
	stringstream ss;
	ss << "The actual rest(" << Utility::GetInstancePtr()->formatMinutes(actRest) << ") is less than the minimum required rest (";
	ss << Utility::GetInstancePtr()->formatMinutes(minRest) << ").";
	string msg = ss.str();

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = singleRule->idRule;
	rv->ruleParamId = singleRule->idRuleParam;
	rv->crewId = crewId;
	rv->rosterId = rosterId;
	rv->pairingId = pairingId;
	//rv->dutySequenceNumber = duty->getDutySegNum();
	//rv->segmentId = segment->getDBId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(actRest)));
	rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(minRest)));
	rv->violation_msg = msg;
	return rv;
}

//1. duty是否匹配ruleParam, 返回true表示匹配、false表示不匹配
//2. 为避免重复计算不重算fdp, 要求调用前已经刷新计算过duty.fdp
bool LegalityChecker::checkRest2125MatchRuleParam(Duty* duty, const DBRule* singleRule) {
	if (!duty || !singleRule) {
		return false;
	}
	rule2124 * cache = (rule2124*)singleRule->parsedParam.get();

	if (cache->composition != "*")
	{
		string compName = duty->getCompositionName();

		//Always recalcuate in editor application
		if (compName == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			compName = getMinCompositionForRest(duty);

		if (compName != cache->composition)
			return false;
	}
	//if (duty->getPairingId() == 27091789 && duty->getDutySeq() == 3)
	//	printf("");
	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	vector<Segment*> segments = duty->getSegments();
	bool hasBunk = true, delayed = false, crossMid = false;
	int landingNum = 0;
	int delayMins = RuleParams::GetInstancePtr()->delayMinutes;
	for (auto& segment : segments)
	{
		string fleet = segment->getFleetCD();
		int i = 0;
		i = resBunks[fleet];
		if (i == 0)
		{
			hasBunk = false;
		}
		if (segment->getFlightNumber().size() > 0 && segment->getIsOperating())
			landingNum++;
		if (segment->getEndTimeUtcAct() - segment->getEndTimeUtcSch() >= delayMins * 60)
			delayed = true;
	}
	string assignment = "FLY";
	if (duty->getPairingId()){
		Pairing* p = this->_dbData->pairingIdMap[duty->getPairingId()];
		assignment = p->getPrimeActivity();
	}
	bool isAssign = false;
	if (cache->assignments[0] != "*")
		for (auto assign : cache->assignments){
			if (this->_dbData->isAssignmentInGroup(assignment, assign)){
				isAssign = true;
				break;
			};
		}
	if (!isAssign)return false;
	//rest bunk
	if (cache->bunk != "*")
	{
		if (cache->bunk == "Y" && !hasBunk)
			return false;
		if (cache->bunk == "N" && hasBunk)
			return false;
	}

	//Delay
	if (cache->delayed != "*")
	{
		if (cache->delayed == "Y" && !delayed)
			return false;
		if (cache->delayed == "N" && delayed)
			return false;
	}

	//midnight
	if (cache->crossMidnight != "*")
	{
		//string arrStation = segments[segments.size() - 1]->getArrStation();
		//auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(arrStation);
		// 老逻辑按照duty结束时区计算duty开始和结束对应的本地时是否跨夜
		auto offsetMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duty, _dbData);
		time_t start = segments[0]->getStartTimeUtcAct();
		time_t end = segments[segments.size() - 1]->getEndTimeUtcAct();
		bool debrief = this->_dbData->systemParamMap["MIDNIGHT_OF_REST_RULE_COUNTING_DEBRIEF"] == "Y";
		if (debrief) {
			end += duty->getMinDebrief() * 60;
		}
		time_t midnight = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes) + 24 * 3600;
		if (start < midnight && end > midnight)
			crossMid = true;
		if (cache->crossMidnight == "Y" && !crossMid)
			return false;
		if (cache->crossMidnight == "N" && crossMid)
			return false;
	}

	//landing number range
	if (!(landingNum <= cache->landingUpper && landingNum >= cache->landingLower))
		return false;

	//FDP
	int fdp = duty->getActualFDP();
	if (cache->fdpLower > fdp || cache->fdpUpper < fdp) {
		return false;
	}

	//所有条件都匹配
	return true;
}
