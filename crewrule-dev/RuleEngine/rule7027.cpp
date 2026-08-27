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

void LegalityChecker::setRestByLocalNights(vector<Duty *>& duties) {
	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::EASA_REST_LNS);
	const vector<DBRule>& localNightRules = this->_dbData->getRuleFunctions(RULES::LOCAL_NIGHT_DEFINITION);

	if (rules.size() == 0 || localNightRules.size() == 0)
		return;

	string isBase = "N";
	auto iterPair = this->_dbData->pairingIdMap.find(duties[0]->getPairingId());
	if (iterPair == this->_dbData->pairingIdMap.end()) {
		return;
	}
	Pairing* pairing = iterPair->second;
	string filiale = pairing->getFiliale();
	if (filiale == "" && pairing->getSegments().size() > 0) {
		auto iterFlt = this->_dbData->flightIdMap.find(pairing->getSegment(0)->getDBId());
		if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second != nullptr) {
			filiale = iterFlt->second->getAirline();
		}
	}
	string arr = pairing->getLastDuty()->getArrivalStation();
	for (auto base : this->_dbData->baseList) {
		if (base.airline == filiale && base.base == arr) {
			isBase = "Y";
			break;
		}
	}
	// 落地不在base 不计算7027
	if (isBase == "N") return;
	//Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localStart = 0, localEnd = 0, minRestInterval = 0;
	string header, headeValue;
	auto& parameter = localNightRules[0].params;
	for (auto nightIter = parameter.begin(); nightIter != parameter.end(); nightIter++)
	{
		header = nightIter->first;
		headeValue = nightIter->second;

		if (header == "LOCAL NIGHT START") {
			localStart = hhmmStrToMinutes(headeValue);
		}
		if (header == "LOCAL NIGHT END") {
			localEnd = hhmmStrToMinutes(headeValue);
		}
		if (header == "MIN INTERVAL HOURS") {
			minRestInterval = hhmmStrToMinutes(headeValue);
		}
	}

	if (localStart == 0 && localEnd == 0 && minRestInterval == 0)
		return;
	if (duties.size() == 0)
		return;
	int maxOffsetMinutes = 0;
	
	int baseOffsetMinutes = this->_dbData->airportUtcOffsetMap[pairing->getBase()];
	Duty* lastDuty = duties[duties.size() - 1];
	for (auto s : pairing->getSegments()) {
		maxOffsetMinutes = max(maxOffsetMinutes, TimezoneUtils::abs(baseOffsetMinutes - this->_dbData->airportUtcOffsetMap[s->getDepStation()]));
		maxOffsetMinutes = max(maxOffsetMinutes, TimezoneUtils::abs(baseOffsetMinutes - this->_dbData->airportUtcOffsetMap[s->getArrStation()]));
	}

	time_t pStart = pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
	time_t pEnd = pairing->getLastDuty()->getLastDebrief()->getEndTimeUtcAct();
	long pTime = static_cast<long>(pEnd - pStart);
	time_t pEndLocal = pairing->getLastDuty()->getLastDebrief()->getEndTimeLocAct();

	for (auto singleRule : rules)
	{
		auto& parameter = singleRule.params;
		long long ruleId = singleRule.idRule;
		string description = singleRule.description;
		string overridebility = singleRule.overridebility;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string tzDiffFrom = "0", tzDiffTo = "24", etrtz_lower = "00:00", etrtz_upper = "9999:59", minLN = "0";
		string strDefinition, strValue;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "REF TZ START") {
				tzDiffFrom = headeValue;
			}
			if (header == "REF TZ END") {
				tzDiffTo = headeValue;
			}
			if (header == "ETRTZ START") {
				etrtz_lower = headeValue;
			}
			if (header == "ETRTZ END") {
				etrtz_upper = headeValue;
			}
			if (header == "MIN LN") {
				minLN = headeValue;
			}

		}
		
		int iETRTZ_From = hhmmToMinutes(etrtz_lower.c_str()) * 60;
		int iETRTZ_To = hhmmToMinutes(etrtz_upper.c_str()) * 60;

		double fTZDiff_From = atof(tzDiffFrom.c_str()) * 60;
		double fTZDiff_To = atof(tzDiffTo.c_str()) * 60;
		int iMinLN = atoi(minLN.c_str());

		if (maxOffsetMinutes >= fTZDiff_From && maxOffsetMinutes <= fTZDiff_To && pTime >= iETRTZ_From && pTime <= iETRTZ_To && iMinLN > 0) {
			// 获取当天开始时间
			time_t endDay = getStartTimeOfDay(pEndLocal);
			// 获取结束的hhmm分钟数
			int endTime = static_cast<int>(pEndLocal - endDay) / 60;

			// localStart 和 localEnd 两种情况
			// 1. ex: localStart=22:00 localEnd=08:00 不在同一天
			// 2. ex: localStart=01:00 localEnd=10:00 在同一天
			bool oneday = false;

			int minRest = 0;
			int lastDayEndMin = 0;
			// start > end 说明start在24点之前
			if (localStart > localEnd) {
				lastDayEndMin = minRestInterval - (24 * 60 - localStart);
			}
			else {
				oneday = true;
				lastDayEndMin = localStart + minRestInterval;
			}
			// TODO 逻辑优化 目前是每种情况都加了个判断 后续整合
			if (oneday) {
				if (endTime <= localStart) {
					minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
				}
				else if (endTime > localStart && endTime < localStart) {
					if (localStart - endTime >= minRestInterval) {
						minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
				}
				else {
					minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
				}
			}
			else {
				if (endTime <= localStart && endTime > localEnd) {
					minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
				}
				else if (localStart < endTime && endTime < 24 * 60) {
					if ((localEnd + 24 * 60) - endTime >= minRestInterval) {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = (iMinLN + 1) * 60 * 24 + lastDayEndMin - endTime;
					}
				}
				else {
					if (localEnd - endTime >= minRestInterval) {
						minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
				}
			}
			/*if (endTime != 0 && endTime <= localStart) {
				minRest = (iMinLN - 1) * 60 * 24 + 24 * 60 * 60 - endTime + lastDayEndMin;
			}
			else if (endTime <= lastEndTime) {
				minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin;
			}
			else {
				minRest = iMinLN * 60 * 24 + (24 * 60 * 60 - endTime) + lastDayEndMin;
			}*/

			if (lastDuty->getActualRest() < minRest) {
				lastDuty->setMinRest(minRest);
				lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleId, singleRule.idRuleParam, overridebility, singleRule.classType, description, singleRule.reference);
			}
		}

	}
}

// 判断是否需要检查7027
bool LegalityChecker::isCheckEASAMinRestLNS(vector<Duty *>& duties) {
	bool check = false;
	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::EASA_REST_LNS);
	const vector<DBRule>& localNightRules = this->_dbData->getRuleFunctions(RULES::LOCAL_NIGHT_DEFINITION);

	if (rules.size() == 0 || localNightRules.size() == 0)
		return check;

	string isBase = "N";
	auto iterPair = this->_dbData->pairingIdMap.find(duties[0]->getPairingId());
	if (iterPair == this->_dbData->pairingIdMap.end()) {
		return check;
	}
	Pairing* pairing = iterPair->second;
	string filiale = pairing->getFiliale();
	if (filiale == "" && pairing->getSegments().size() > 0) {
		auto iterFlt = this->_dbData->flightIdMap.find(pairing->getSegment(0)->getDBId());
		if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second != nullptr) {
			filiale = iterFlt->second->getAirline();
		}
	}
	string arr = pairing->getLastDuty()->getArrivalStation();
	for (auto base : this->_dbData->baseList) {
		if (base.airline == filiale && base.base == arr) {
			isBase = "Y";
			break;
		}
	}
	// 落地不在base 不计算7027
	if (isBase == "N") return check;
	//Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int localStart = 0, localEnd = 0, minRestInterval = 0;
	string header, headeValue;
	auto& parameter = localNightRules[0].params;
	for (auto nightIter = parameter.begin(); nightIter != parameter.end(); nightIter++)
	{
		header = nightIter->first;
		headeValue = nightIter->second;

		if (header == "LOCAL NIGHT START") {
			localStart = hhmmStrToMinutes(headeValue);
		}
		if (header == "LOCAL NIGHT END") {
			localEnd = hhmmStrToMinutes(headeValue);
		}
		if (header == "MIN INTERVAL HOURS") {
			minRestInterval = hhmmStrToMinutes(headeValue);
		}
	}

	if (localStart == 0 && localEnd == 0 && minRestInterval == 0)
		return check;
	if (duties.size() == 0)
		return check;
	int maxOffsetMinutes = 0;

	int baseOffsetMinutes = this->_dbData->airportUtcOffsetMap[pairing->getBase()];
	Duty* lastDuty = duties[duties.size() - 1];
	for (auto s : pairing->getSegments()) {
		maxOffsetMinutes = max(maxOffsetMinutes, TimezoneUtils::abs(baseOffsetMinutes - this->_dbData->airportUtcOffsetMap[s->getDepStation()]));
		maxOffsetMinutes = max(maxOffsetMinutes, TimezoneUtils::abs(baseOffsetMinutes - this->_dbData->airportUtcOffsetMap[s->getArrStation()]));
	}

	time_t pStart = pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
	time_t pEnd = pairing->getLastDuty()->getLastDebrief()->getEndTimeUtcAct();
	long pTime = static_cast<long>(pEnd - pStart);
	time_t pEndLocal = pairing->getLastDuty()->getLastDebrief()->getEndTimeLocAct();

	for (auto singleRule : rules)
	{
		auto& parameter = singleRule.params;
		long long ruleId = singleRule.idRule;
		string description = singleRule.description;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string tzDiffFrom = "0", tzDiffTo = "24", etrtz_lower = "00:00", etrtz_upper = "9999:59", minLN = "0";
		string strDefinition, strValue;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "REF TZ START") {
				tzDiffFrom = headeValue;
			}
			if (header == "REF TZ END") {
				tzDiffTo = headeValue;
			}
			if (header == "ETRTZ START") {
				etrtz_lower = headeValue;
			}
			if (header == "ETRTZ END") {
				etrtz_upper = headeValue;
			}
			if (header == "MIN LN") {
				minLN = headeValue;
			}

		}

		int iETRTZ_From = hhmmToMinutes(etrtz_lower.c_str()) * 60;
		int iETRTZ_To = hhmmToMinutes(etrtz_upper.c_str()) * 60;

		double fTZDiff_From = atof(tzDiffFrom.c_str()) * 60;
		double fTZDiff_To = atof(tzDiffTo.c_str()) * 60;
		int iMinLN = atoi(minLN.c_str());

		if (maxOffsetMinutes >= fTZDiff_From && maxOffsetMinutes <= fTZDiff_To && pTime >= iETRTZ_From && pTime <= iETRTZ_To && iMinLN > 0) {
			// 获取当天开始时间
			time_t endDay = getStartTimeOfDay(pEndLocal);
			// 获取结束的hhmm分钟数
			int endTime = static_cast<int>(pEndLocal - endDay) / 60;

			// localStart 和 localEnd 两种情况
			// 1. ex: localStart=22:00 localEnd=08:00 不在同一天
			// 2. ex: localStart=01:00 localEnd=10:00 在同一天
			bool oneday = false;
			int minRest = 0;
			int lastDayEndMin = 0;
			// start > end 说明start在24点之前
			if (localStart > localEnd) {
				lastDayEndMin = minRestInterval - (24 * 60 - localStart);
			}
			else {
				oneday = true;
				lastDayEndMin = localStart + minRestInterval;
			}
			// TODO 逻辑优化 目前是每种情况都加了个判断 后续整合
			if (oneday) {
				if (endTime <= localStart) {
					minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
				}
				else if (endTime > localStart && endTime < localStart) {
					if (localStart - endTime >= minRestInterval) {
						minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
				}
				else {
					minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
				}
			}
			else {
				if (endTime <= localStart && endTime > localEnd) {
					minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
				}
				else if (localStart < endTime && endTime < 24 * 60) {
					if ((localEnd + 24 * 60) - endTime >= minRestInterval) {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = (iMinLN + 1) * 60 * 24 + lastDayEndMin - endTime;
					}
				}
				else {
					if (localEnd - endTime >= minRestInterval) {
						minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin - endTime;
					}
					else {
						minRest = iMinLN * 60 * 24 + lastDayEndMin - endTime;
					}
				}
			}
			/*if (endTime != 0 && endTime <= localStart) {
				minRest = (iMinLN - 1) * 60 * 24 + 24 * 60 * 60 - endTime + lastDayEndMin;
			}
			else if (endTime <= lastEndTime) {
				minRest = (iMinLN - 1) * 60 * 24 + lastDayEndMin;
			}
			else {
				minRest = iMinLN * 60 * 24 + (24 * 60 * 60 - endTime) + lastDayEndMin;
			}*/

			if (minRest != 0) {
				check = true;
			}
		}

	}
	return check;
}

bool LegalityChecker::checkEASAMinRestLN(Pairing* p, SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster, SharedPtr<ROSTER> nextNextRoster)
{
	bool bIsLegal = true;
	string description;
	//for (std::size_t i = 0; i < p->getNumDuties(); i++) {
	Duty* duty = p->getLastDuty();
	if (duty == NULL || roster == NULL || nextRoster == NULL) {
		return bIsLegal;
	}
	vector<Duty *> duties = p->getDutyVec();
	if (!isCheckEASAMinRestLNS(duties)) {
		return bIsLegal;
	}
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
	if (nextRoster && nextRoster->pairing) {
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
			return bIsLegal;
		}
	}

	if (minRest > 0 && actualRest < minRest && actualRest >= 0)
	{
		//20191020 ain, mantis#6893, 问题5, 若相邻roster符合 mergeFdp，且后roster为加载数据末尾，则忽略2124
		if (roster && roster->isMergeFdpWithNext && !nextNextRoster) {
			return bIsLegal;
		}
		//mantis#8385 2124 在三个均为mergfdp时 是无法判断是否rest足够的 需要到最后才能确认
		if (roster && roster->isMergeFdpWithNext
			&& nextRoster && nextRoster->isMergeFdpWithNext
			&& nextNextRoster && nextNextRoster->isMergeFdpWithNext) {
			return bIsLegal;
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
		const vector<DBRule>& rule2124 = this->_dbData->getRuleFunctions(RULES::EASA_REST_LNS);
		if (rule2124.size()) {
			this->addRuleViolations(rv, &rule2124[0]);
		}
		else {
			this->addRuleViolations(rv, NULL);
		}
		bIsLegal = false;
	}
	//}
	return bIsLegal;
}