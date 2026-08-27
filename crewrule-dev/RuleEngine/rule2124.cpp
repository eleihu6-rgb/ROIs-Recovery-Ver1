#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "utils/DutyUtils.h"
#include "StringUtil.h"
#include "CustomBiz/CustomBiz.h"
#include "basicCalculation.h"

static int getNextDutyActRest(shared_ptr<ROSTER>& nextRoster, shared_ptr<ROSTER>& nextNextRoster);

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);

//GEN_MIN_REST
void LegalityChecker::setMinRest(Duty * duty, const DBRule* singleRule, long callinSBY_FDPMins)
{

	//0003783: PO法规2124 当航班3人制，但组成的duty不超2人制限制时，休息期应按照2人制计算

	//0004032: 2124法规需要根据2007/2008计算出最经济配比，再月2124配比对比并找出最合适的min rest值
	rule2124 * cache = (rule2124*)singleRule->parsedParam.get();

	if (checkMinRest(duty, singleRule, callinSBY_FDPMins)){
		duty->setMinRest(cache->minRest);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, cache->minRest, singleRule->idRule, singleRule->idRuleParam, singleRule->overridebility, singleRule->classType, singleRule->description, singleRule->reference);//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
	}
}

//GEN_MIN_REST
void LegalityChecker::setMinRest(Pairing* pairing, const DBRule* singleRule, long callinSBY_FDPMins)
{

	//0003783: PO法规2124 当航班3人制，但组成的duty不超2人制限制时，休息期应按照2人制计算

	//0004032: 2124法规需要根据2007/2008计算出最经济配比，再月2124配比对比并找出最合适的min rest值
	rule2124* cache = (rule2124*)singleRule->parsedParam.get();

	if (cache->attributes.size() > 0 && cache->attributes[0] != "*" && !cache->attributes[0].empty()) {
		const auto& pairingArrt = pairing->getAttribute();
		bool foundAttribute = false;
		for (const auto& attrubute : cache->attributes) {
			if (pairingArrt.find(attrubute) != string::npos) {
				foundAttribute = true;
				break;
			}
		}
		if (!foundAttribute)
			return;
	}

	for (auto duty : pairing->getDutyVec()) {
		if (checkMinRest(duty, singleRule, callinSBY_FDPMins, true)) {
			duty->setMinRest(cache->minRest);
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, cache->minRest, singleRule->idRule, singleRule->idRuleParam, singleRule->overridebility, singleRule->classType, singleRule->description, singleRule->reference);//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
		}
	}
	
}


void LegalityChecker::setMinRest(Duty * duty, const DBRule* singleRule, int index, SharedPtr<ROSTER> roster){
	rule2124 * cache = (rule2124*)singleRule->parsedParam.get();
	if (cache->attributes.size() > 0 && cache->attributes[0] != "*" && !cache->attributes[0].empty()) {
		const auto& pairingAttr = roster->pairing->getAttribute();
		bool foundAttribute = false;
		for (const auto& attribute : cache->attributes) {
			if (pairingAttr.find(attribute) != string::npos) {
				foundAttribute = true;
				break;
			}
		}
		if (!foundAttribute)
			return;
	}
	if (checkMinRest(duty, singleRule, roster->callinSBY_FDPMins, true)){
		roster->dutyValues.setMinRest(index, cache->minRest);
		duty->setMinRest(cache->minRest);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, cache->minRest, singleRule->idRule, singleRule->idRuleParam, singleRule->overridebility, singleRule->classType, singleRule->description, singleRule->reference);
	}
}

void LegalityChecker::setMinRest(Pairing* pairing, const DBRule* singleRule, int index, SharedPtr<ROSTER> roster) {
	rule2124* cache = (rule2124*)singleRule->parsedParam.get();
	if (cache->attributes.size() > 0 && cache->attributes[0] != "*" && !cache->attributes[0].empty()) {
		const auto& pairingArrt = pairing->getAttribute();
		bool foundAttribute = false;
		for (const auto& attrubute : cache->attributes) {
			if (pairingArrt.find(attrubute) != string::npos) {
				foundAttribute = true;
				break;
			}
		}
		if (!foundAttribute)
			return;
	}
	for (auto duty : pairing->getDutyVec()) {
		if (checkMinRest(duty, singleRule, roster->callinSBY_FDPMins, true)) {
			roster->dutyValues.setMinRest(index, cache->minRest);
			duty->setMinRest(cache->minRest);
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, cache->minRest, singleRule->idRule, singleRule->idRuleParam, singleRule->overridebility, singleRule->classType, singleRule->description, singleRule->reference);
		}
	}
}

bool LegalityChecker::checkMinRest(Duty * duty, const DBRule* singleRule, long callinSBY_FDPMins, bool skipAttr){
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
	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	vector<Segment*> segments = duty->getSegments();
	bool hasBunk = true, delayed = false;
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
	if (!duty->getAssignment().empty()){
		assignment = duty->getAssignment();
	}
	bool isAssign = false;
	if (cache->assignments[0] != "*") {
		for (auto assign : cache->assignments) {
			if (this->_dbData->isAssignmentInGroup(assignment, assign)) {
				isAssign = true;
				break;
			};
		}
	}
	else {
		isAssign = true;
	}
	if (!isAssign)return false;

	//fleet and sub fleet
	string dutyFleet, dutySubFleet;

	DutyUtils::GetFleetAndSubFleet(dutyFleet, dutySubFleet, duty);
	if (!cache->fleets.empty() && std::find(cache->fleets.begin(), cache->fleets.end(), dutyFleet) == cache->fleets.end())
		return false;

	if (!cache->subFleets.empty() && std::find(cache->subFleets.begin(), cache->subFleets.end(), dutySubFleet) == cache->subFleets.end())
		return false;

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

		bool crossMid = false;
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

	//fdp range
	//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
	calculatePairingDutyTimes(duty, this->_dbData.get());
	long fdp = duty->getFDPInSecs();
	
	if (duty->getDutySeq() == 1 && callinSBY_FDPMins > 0)
		fdp += callinSBY_FDPMins * 60;

	if (!(fdp <= cache->fdpUpper * 60 && fdp >= cache->fdpLower * 60))
		return false;

	//blh
	long blh = duty->getBLKInMins() * 60;
	if (!(blh >= cache->blhLower * 60 && blh <= cache->blhUpper * 60))
		return false;

	long dp = duty->getDPInSecs();
	if (dp < cache->dpLower * 60 || dp > cache->dpUpper * 60)
		return false;

	if (!skipAttr && cache->attributes.size() > 0 && cache->attributes[0] != "*" && !cache->attributes[0].empty()) {
		return false;
	}


	return true;
}

//crew 为空表示检查纯pairing法规，忽略末尾act rest
bool LegalityChecker::checkMinRest(Pairing * pPairing, SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster, SharedPtr<ROSTER> nextNextRoster)
{

	bool bIsLegal = true;
	string strBase = pPairing->getBase();
	string isRound = this->_dbData->systemParamMap["CALC_REST_ROUND"];
	string description;
	/*if (roster && roster->idcrew == "002550" && roster->pairId == 27483612) {
		cout << "";
	}*/
	for (std::size_t i = 0; i < pPairing->getNumDuties(); i++)
	{
		//20180811 ain, mantis#3790, editor检查pairing时忽略末尾 act rest
		if (roster == NULL && i == pPairing->getNumDuties() - 1) {
			continue;
		}
		//20190322 yuankai.cai mantis#5200 editor检查Crew时忽略最后一个Roster末尾 act rest
		else if (nextRoster == NULL && i == pPairing->getNumDuties() - 1) {
			continue;
		}

		//0005258: 待命抓飛勤務重疊，出現很多告警訊息
		if (isCallinStandby(roster, nextRoster))
		{
			continue;
		}
		Duty * duty = pPairing->getDuty(i);
		Duty * nextDuty = (i + 1) >= pPairing->getNumDuties() ? nullptr : pPairing->getDuty(i+1);
		bool isRosterError = false;
		int minRest = duty->getMinRest();
		int minRestAtBase = duty->getMinRestAtBase();
		string strArrStation = duty->getArrStation();
		if (strBase == strArrStation)
		{
			minRest = max(minRest, minRestAtBase);
		}

		//这个方式要取代目前duty的min resst/max fdp等获取限制的方式，暂时兼容过往方式
		//sgq 2019.5.13
		limitaions* iMinDutyRest = duty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
		long long ruleId = 0;
		if (iMinDutyRest)
		{
			if (iMinDutyRest->value >= minRest)
			{
				minRest = iMinDutyRest->value;

				ruleId = iMinDutyRest->last_set_rule;
				description = iMinDutyRest->description;
			}
		}

		//20210812 ain, mantis#9425, actRest = prevDuty.pickup.start - nextDuty.dropoff.end
		int actualRest = duty->getActualRest();
		if (i != pPairing->getNumDuties() - 1){

			time_t restStart = duty->getEndTimeUtcAct();
			time_t restEnd = pPairing->getDuty(i + 1)->getStartTimeUtcAct();
			shared_ptr<PairingDutyNode> dropoff = duty->getLastDropoff();
			shared_ptr<PairingDutyNode> pickup = pPairing->getDuty(i + 1)->getFirstPickup();
			if (dropoff && dropoff->getEndTimeUtcAct() > restStart) {
				restStart = dropoff->getEndTimeUtcAct();
			}
			if (pickup && pickup->getStartTimeUtcAct() < restEnd) {
				restEnd = pickup->getStartTimeUtcAct();
			}

			actualRest = static_cast<int>(restEnd - restStart) / 60;

			
		}
		if (roster)
		{

			//20181028 ain, mantis#4217, 若roster.minRest > 0说明存在roster单独修正, 如前SBY重叠延长FDP导致延迟rest
			int minRestOfRoster = roster->dutyValues.getMinRest(i);
			minRest = minRestOfRoster > 0 ? minRestOfRoster : minRest;
			//20181211 ain, mantis#4609, 初始化ptn阶段末尾duty不计算actRest, 改由roster.rest确定末尾actRest
			//if (i == pPairing->getNumDuties() - 1){
			//	actualRest = (roster->getEndTimeUtcAct() - roster->getRestStartUtcAct()) / 60;
			//}
			//20190321 yuankai.cai mantis#4949 minRest 因由前后roster之间间距获取
			if (i == pPairing->getNumDuties() - 1 && nextRoster)
			{
				string nextDuty = nextRoster->qualifier;
				if (nextRoster && nextNextRoster && nextRoster->isMergeFdpWithFly && nextRoster->mergeFdpAssignment != "") {
					nextDuty = nextRoster->mergeFdpAssignment;
				}
				if (isAssignmentMrtOveride(roster->qualifier, nextDuty)){
					continue;
				}
				if (RuleParams::GetInstancePtr()->isRestAssignment(nextRoster->qualifier, nextRoster->duty))
				{
					actualRest = static_cast<int>(nextRoster->getEndTimeUtcAct() - roster->getRestStartUtcAct()) / 60;
				}
				else
				{
					actualRest = static_cast<int>(nextRoster->getStartTimeUtcAct() - roster->getRestStartUtcAct()) / 60;
				}

				// mantis#5061, nextRoster是rest或MVP時不需要檢查
				// mantis#5648, MVP只有回組員base時才不用檢查
				if (nextRoster->duty == "MVP" && nextRoster->pairing)
				{
					string crewId = nextRoster->idcrew;
					if (this->_dbData->crewIdMap[crewId]->getCrewBase(nextRoster->actStrUtc) == nextRoster->pairing->getEndArp())
					{
						continue;
					}
				}

				isRosterError = true;
			}
		}

		if (i == pPairing->getNumDuties() - 2 && pPairing->getDuty(i + 1)->getNumSegments() == 1)
		{
			string assignment = pPairing->getDuty(i + 1)->getSegment(0)->getAssignment();
			if (assignment == "SUR" || assignment == "PNC" || assignment == "SNY" || assignment == "PAX")
			{
				//mantis#5748, 最後一段是PNC或SNY時外籍組員從台灣回日越泰等國家不告警
				//mantis#6044, 休時不足銜接SUR勤務本籍組員仍須告警
				Segment *segment = pPairing->getDuty(i + 1)->getSegment(0);
				string depstation = segment->getDepStation();
				string arrstation = segment->getArrStation();
				string depCountry = this->_dbData->findAirportCountry(depstation);
				string arvCountry = this->_dbData->findAirportCountry(arrstation);
				if (depCountry == "TW" && (arvCountry == "JP" || arvCountry == "VN" || arvCountry == "TH"))
				{
					continue;
				}
			}
		}

		if (isRound == "Y")
		{
			time_t dutyEnd = duty->getEndTimeUtcAct();
			actualRest -= static_cast<int>((Utility::GetInstancePtr()->getTimeByRoundHour(dutyEnd, true) - dutyEnd) / 60);
			if (i < pPairing->getNumDuties() - 1)
			{
				time_t nextDutyStart = pPairing->getDuty(i + 1)->getStartTimeUtcAct();
				actualRest -= static_cast<int>((nextDutyStart - Utility::GetInstancePtr()->getTimeByRoundHour(nextDutyStart, false)) / 60);
			}
		}
		
		//检测 rest不足时候 是否可以根据后一个任务/任务环的rest进行判断
		if (nextRoster && minRest > 0 && actualRest < minRest && actualRest >= 0)
		{
			if (roster->isMergeFdpWithNext && nextRoster->isMergeFdpWithNext && isMergeTwoRosterOk(roster, nextRoster, this->_dbData)){
				continue;
			}
		}
		
		if (minRest > 0 && actualRest < minRest && actualRest >= 0)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			//20191020 ain, mantis#6893, 问题5, 若相邻roster符合 mergeFdp，且后roster为加载数据末尾，则忽略2124
			if (roster && roster->isMergeFdpWithNext && !nextNextRoster) {
				continue;
			}
			//mantis#8385 2124 在三个均为mergfdp时 是无法判断是否rest足够的 需要到最后才能确认
			if (roster && roster->isMergeFdpWithNext 
				&& nextRoster && nextRoster->isMergeFdpWithNext
				&& nextNextRoster && nextNextRoster->isMergeFdpWithNext) {
				continue;
			}
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			string msg;

			msg = "The actual rest period(" + Utility::GetInstancePtr()->formatMinutes(actualRest) + ") ";
			msg += " is less than the minimum required rest (" + Utility::GetInstancePtr()->formatMinutes(minRest) + ")";

			if (isRound == "Y"){
				msg += ",[Round=T].";
				rv->operation_result.insert(pair<string, string>("isRound", "Y"));
			}

			//if (this->_dbData->scenario.airline != "BR")
			//{
			//	this->setLegalityMessage(duty, NULL, NULL, msg);
			//}
			if (roster){
				rv->crewId = roster->idcrew;
				rv->rosterId = roster->rosterId;
			}
			rv->description = description;
			rv->pairingId = pPairing->getDbId();
			rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = duty->getEndTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct() + actualRest * 60;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = ruleId;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("ruleId", Utility::GetInstancePtr()->llToa(ruleId)));
			rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->formatMinutes(actualRest)));
			rv->operation_result.insert(pair<string, string>("minRest", Utility::GetInstancePtr()->formatMinutes(minRest)));
			auto& rule2124 = this->_dbData->getRuleFunctions(RULES::GEN_MIN_REST);
			if (rule2124.size()) {
				this->addRuleViolations(rv, &rule2124[0]);
			}
			else {
				this->addRuleViolations(rv, NULL);
			}
			bIsLegal = false;
		}

	}
	return bIsLegal;

}

bool LegalityChecker::isAssignmentMrtOveride(string assign1, string assign2){

	for (auto mrtOveride : this->_dbData->assignmentMrtOveride){
		if ((this->_dbData->isAssignmentInGroup(assign1, mrtOveride->assignmentGroupPrev) 
			&& (mrtOveride->assignmentPrev.find(assign1) != mrtOveride->assignmentPrev.npos
			|| mrtOveride->assignmentPrev == "*"))
			|| mrtOveride->assignmentGroupPrev == "*" || mrtOveride->assignmentGroupPrev == assign1){

			if ((this->_dbData->isAssignmentInGroup(assign2, mrtOveride->assignmentGroupNext)
				&& (mrtOveride->assignmentNext.find(assign2) != mrtOveride->assignmentNext.npos
				|| mrtOveride->assignmentNext == "*"))
				|| mrtOveride->assignmentGroupNext == "*" || mrtOveride->assignmentGroupNext == assign2){
				return true;
			}
		}
		
	}
	return false;
};
//获取nextRoster或 nextRoster.duty[0]实际休息, 用于 2124/2125 针对mergeFDP以下一个休息为准 
//1. 若nextRoster无duty, 且nextNextRoster存在，则 nextRest=nextNextRoster.start - nextRoster.restStart
//2. 若nextRoster无duty, 且nextNextRoster不存在，则 nextRest=nextRoster.rest
//3. 若nextRoster有两或以上duty, 则nextRest=nextRoster.duty[1].start - nextRoster.duty[0].end
//4. 若nextRoster有一个duty, 且nextNextRoster存在, 则 nextRest=nextNextRoster.start - nextRoster.restStart
//5. 若nextRoster有一个duty, 且nextNextRoster不存在, 则 nextRest=nextRoster.rest
static int getNextDutyActRest(shared_ptr<ROSTER>& nextRoster, shared_ptr<ROSTER>& nextNextRoster) {
	int nextActRestSecs = 0;
	if (!nextRoster->pairing && nextNextRoster) {
		nextActRestSecs = static_cast<int>(nextNextRoster->getStartTimeUtcAct() - nextRoster->getRestStartUtcAct());
	}
	else if (!nextRoster->pairing && !nextNextRoster) {
		nextActRestSecs = static_cast<int>(nextRoster->getEndTimeUtcAct() - nextRoster->getRestStartUtcAct());
	}
	else if (nextRoster->pairing && nextRoster->pairing->getNumDuties() >= 2) {
		nextActRestSecs = static_cast<int>(nextRoster->pairing->getDuty(1)->getStartTimeUtcAct() - nextRoster->pairing->getDuty(0)->getEndTimeUtcAct());
	}
	else if (nextRoster->pairing && nextRoster->pairing->getNumDuties() == 1 && nextNextRoster) {
		nextActRestSecs = static_cast<int>(nextNextRoster->getStartTimeUtcAct() - nextRoster->getRestStartUtcAct());
	}
	else if (nextRoster->pairing && nextRoster->pairing->getNumDuties() == 1 && !nextNextRoster) {
		nextActRestSecs = static_cast<int>(nextRoster->getEndTimeUtcAct() - nextRoster->getRestStartUtcAct());
	}
	return nextActRestSecs / 60;
}