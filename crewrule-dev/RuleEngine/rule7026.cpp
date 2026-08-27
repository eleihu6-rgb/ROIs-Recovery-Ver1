#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "basicCalculation.h"
#include "TimezoneUtils.h"

void LegalityChecker::setRestPeriods(Duty* duty) 
{
	auto iterPair = this->_dbData->pairingIdMap.find(duty->getPairingId());
	if (iterPair == this->_dbData->pairingIdMap.end()) {
		return;
	}
	string filiale = iterPair->second->getFiliale();
	if (filiale == "" && duty->getSegments().size() > 0) {
		auto iterFlt = this->_dbData->flightIdMap.find(duty->getSegment(0)->getDBId());
		if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second != nullptr) {
			filiale = iterFlt->second->getAirline();
		}
	}

	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::EASA_REST_PERIODS);

	string dep = duty->getDepartureStation();
	string arv = duty->getArrivalStation();
	vector<BASE> baseList = this->_dbData->baseList;

	string isBase = "N";
	int depOffsetMinutes = this->_dbData->airportUtcOffsetMap[dep];
	int arvOffsetMinutes = this->_dbData->airportUtcOffsetMap[arv];
	int offsetMinutes = TimezoneUtils::abs(depOffsetMinutes - arvOffsetMinutes);

	for (auto base : baseList) {
		if (base.airline == filiale && base.base == arv) {
			isBase = "Y";
			break;
		}
	}

	for (auto& singleRule : rules)
	{
		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string isHomeBase, minRest;
		int tzStart = 0; int tzEnd = 0;
		long long ruleId = singleRule.idRule;
		string description = singleRule.description;
		string overridebility = singleRule.overridebility;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "IS HOME BASE") {
				isHomeBase = headeValue;
			}
			if (header == "TZ START") {
				tzStart = std::stoi(headeValue);
			}
			if (header == "TZ END") {
				tzEnd = std::stoi(headeValue);
			}
			if (header == "MIN REST(MAX DP OR)") {
				minRest = headeValue;
			}

		}

		if (isHomeBase == isBase && tzStart * 60 <= offsetMinutes && tzEnd * 60 >= offsetMinutes) {
			long dp = duty->getDPInSecs() / 60;
			long rest = hhmmToMinutes(minRest.c_str());
			duty->setMinRest(dp > rest ? dp : rest);
			if (this->_dbData->pairingIdMap[duty->getPairingId()]->getLastDuty()->getId() != duty->getId()) {
				vector<Duty*> duties = this->_dbData->pairingIdMap[duty->getPairingId()]->getDutyVec();
				for (std::size_t i = 0; i < duties.size(); i++) {
					if (duties[i]->getId() == duty->getId()) {
						Duty* nextDuty = duties[i + 1];
						time_t restStart = duty->getLastDebrief()->getEndTimeUtcAct();
						time_t restEnd = nextDuty->getFirstBreif()->getStartTimeUtcAct();
						duty->setActualRest(static_cast<int>(restEnd - restStart) / 60);
					}
				}
			}
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, dp > rest ? dp : rest, ruleId, singleRule.idRuleParam, overridebility, singleRule.classType, description, singleRule.reference);
		}

	}
}

bool LegalityChecker::checkEASAMinRest(Pairing* p, SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster, SharedPtr<ROSTER> nextNextRoster)
{
	bool bIsLegal = true;
	string description;
	for (std::size_t i = 0; i < p->getNumDuties(); i++) {
		if (roster == NULL && i == p->getNumDuties() - 1) { 
			continue;
		}
		else if (nextRoster == NULL && i == p->getNumDuties() - 1) {
			continue;
		}
		Duty * duty = p->getDuty(i);
		Duty * nextDuty = (i + 1) >= p->getNumDuties() ? nullptr : p->getDuty(i + 1);
		int minRest = duty->getMinRest();

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


		int actualRest = duty->getActualRest();
		if (i != p->getNumDuties() - 1) {

			time_t restStart = duty->getEndTimeUtcAct();
			time_t restEnd = p->getDuty(i + 1)->getStartTimeUtcAct();
			shared_ptr<PairingDutyNode> dropoff = duty->getLastDropoff();
			shared_ptr<PairingDutyNode> pickup = p->getDuty(i + 1)->getFirstPickup();
			if (dropoff && dropoff->getEndUtc() > restStart) {
				restStart = dropoff->getEndUtc();
			}
			if (pickup && pickup->getStartUtc() < restEnd) {
				restEnd = pickup->getStartUtc();
			}

			actualRest = static_cast<int>(restEnd - restStart) / 60;


		}
		else if (nextRoster && nextRoster->pairing) {
			Pairing* nextPtn = nextRoster->pairing;
			time_t restEnd = nextPtn->getFirstDuty()->getStartTimeUtcAct();
			time_t restStart = duty->getEndTimeUtcAct();
			shared_ptr<PairingDutyNode> debrief = duty->getLastDebrief();
			shared_ptr<PairingDutyNode> brief = nextPtn->getFirstDuty()->getFirstBreif();
			if (debrief && debrief->getEndUtc() > restStart) {
				restStart = debrief->getEndUtc();
			}
			if (brief && brief->getStartUtc() < restEnd) {
				restEnd = brief->getStartUtc();
			}
			actualRest = static_cast<int>(restEnd - restStart) / 60;
		}

		//检测 rest不足时候 是否可以根据后一个任务/任务环的rest进行判断
		if (nextRoster && minRest > 0 && actualRest < minRest && actualRest >= 0)
		{
			if (roster->isMergeFdpWithNext && nextRoster->isMergeFdpWithNext && isMergeTwoRosterOk(roster, nextRoster, this->_dbData)) {
				continue;
			}
		}

		if (minRest > 0 && actualRest < minRest && actualRest >= 0)
		{
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

			if (this->GetApplication() == PAIRING_OPTIMIZER)
				return false;

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			string msg;

			msg = "Actual rest time (" + Utility::GetInstancePtr()->formatMinutes(actualRest) + ") ";
			msg += " is less than minimal required (" + Utility::GetInstancePtr()->formatMinutes(minRest) + ")";

			//if (this->_dbData->scenario.airline != "BR")
			//{
			//	this->setLegalityMessage(duty, NULL, NULL, msg);
			//}
			if (roster) {
				rv->crewId = roster->idcrew;
				rv->rosterId = roster->rosterId;
			}
			rv->description = description;
			rv->pairingId = p->getDbId();
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
			const vector<DBRule>& rule2124 = this->_dbData->getRuleFunctions(RULES::EASA_REST_PERIODS);
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