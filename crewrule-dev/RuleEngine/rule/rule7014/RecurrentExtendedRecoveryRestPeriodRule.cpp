#include "RecurrentExtendedRecoveryRestPeriodRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "RecurrentExtendedRecoveryRestPeriodRuleParam.h"

#include "utils/StringUtils.h"
#include "utils/PhaseUtils.h"

namespace {

bool IsRosterRestAssignment(const CrewDataContext* dbData, const ROSTER* roster) {
	if (dbData == nullptr || roster == nullptr) {
		return false;
	}
	auto assignmentIter = dbData->assignmentNameMap.find(roster->qualifier);
	if (assignmentIter == dbData->assignmentNameMap.end() || assignmentIter->second == nullptr) {
		return false;
	}
	const std::string& type = assignmentIter->second->TYPE;
	return type == "L" || type == "O";
}

}


//按crew检查
bool RecurrentExtendedRecoveryRestPeriodRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	bool isValid = false;
	if (rosters.size() == 0)
		return true;
	time_t rollingWindow_start, rollingWindow_end;
	if (this->_application != ROSTER_OPTIMIZER)
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC;
	}

	
	time_t tempStart = rosters[0]->actEndUtc;
	string weekdayStartFrom = this->GetDataContext()->getWeekdayStartFrom();
	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];		

	offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	for (const auto & ruleParam : this->_ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		// 收集RERRP
		vector<std::shared_ptr<CREW_RERRP>> restPeriodList;
		time_t checkStartTime = this->_dbData->scenario.startDtUTC;
		time_t checkEndTime = 0;
		bool lastRosterIsPA = false;
		for (size_t i = 0; i < rosters.size(); i++) {
			if (rosters[i]->getStartTimeUtcAct() < this->_dbData->scenario.startDtUTC) continue;

			if (this->_application == ROSTER_OPTIMIZER && lastRosterIsPA && rosters[i]->source == "PA") {
				checkStartTime = rosters[i]->getRestStartLocAct();
				lastRosterIsPA = rosters[i]->source == "PA";
				continue;
			}

			if (rosters[i] != nullptr && !PhaseUtils::IsChecked(rosters[i], ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			const bool isMatchedAssignment = ruleParam.MatchAssignment(rosters[i]->qualifier);
			if (isMatchedAssignment && IsRosterRestAssignment(this->_dbData.get(), rosters[i])) {
				lastRosterIsPA = rosters[i]->source == "PA";
				continue;
			}

			if (!isMatchedAssignment && !ruleParam._isCountBlankDay) continue;
			checkEndTime = rosters[i]->getStartTimeLocAct();
			if (ruleParam.IsRERRP(checkStartTime, checkEndTime)) {
				std::shared_ptr<CREW_RERRP> restPeriod(new CREW_RERRP());
				restPeriod->crewId = crew->idCrew;
				restPeriod->startTimeLoc = checkStartTime;
				restPeriod->endTimeLoc = checkEndTime;
				restPeriodList.push_back(restPeriod);
			}
			
			
			checkStartTime = rosters[i]->getRestStartLocAct();
			lastRosterIsPA = rosters[i]->source == "PA";
		}

		//最后一个任务到结束
		if (ruleParam._isCountBlankDay) {
			checkEndTime = this->_dbData->scenario.endDtLoc;
			if (ruleParam.IsRERRP(checkStartTime, checkEndTime)) {
				std::shared_ptr<CREW_RERRP> restPeriod(new CREW_RERRP());
				restPeriod->crewId = crew->idCrew;
				restPeriod->startTimeLoc = checkStartTime;
				restPeriod->endTimeLoc = checkEndTime;
				restPeriodList.push_back(restPeriod);
			}
		}

		crew->rerrpList = restPeriodList;
		if (restPeriodList.empty()) continue;
		//检查两个RERRP之前间距
		for (int r = 0; r < (int)restPeriodList.size() - 1; r++) {
			if (!ruleParam.DurationOfRerrps(restPeriodList[r]->endTimeLoc, restPeriodList[r + 1]->startTimeLoc)) {
				if (this->_application == ROSTER_OPTIMIZER) {
					return false;
				}
				_ruleViolation.SetParam("start", to_string(restPeriodList[r]->endTimeLoc - offsetMinutes * 60));
				_ruleViolation.SetParam("end", to_string(restPeriodList[r + 1]->startTimeLoc - offsetMinutes * 60));
				_ruleViolation.SetParam("space", "1");
				_ruleViolation.SetParam("space_hours", to_string(ruleParam._maxSpanBetweenRerrps / 60));
				ThrowRuleViolation();
				continue;
			}
		}

		//map<time_t, time_t> mp;
		//if (ruleParam._unit == "CM")
		//{
		//	mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end + 24 * 3600, offsetMinutes, ruleParam._period);
		//}
		//else if (ruleParam._unit == "CW")
		//{
		//	mp = Utility::GetInstancePtr()->getWeeksRollingWindows(rollingWindow_start - (ruleParam._period * 7 - 1) * 24 * 3600, rollingWindow_end + (ruleParam._period * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, ruleParam._period);
		//}
		//else if (ruleParam._unit == "CD")
		//{
		//	mp = Utility::GetInstancePtr()->getDaysRollingWindows(rollingWindow_start - (ruleParam._period - 1) * 24 * 3600, rollingWindow_end + (ruleParam._period - 1) * 24 * 3600, offsetMinutes, ruleParam._period);
		//}
		//else
		//	return true;

		//vector<std::shared_ptr<CREW_RERRP>> rerrpList;
		//for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
		//	rerrpList.clear();
		//	_ruleViolation.SetParam("start", to_string(mp_it->first));
		//	_ruleViolation.SetParam("end", to_string(mp_it->second));
		//	_ruleViolation.SetParam("min_rerrp", to_string(ruleParam._minRerrpNum));
		//	_ruleViolation.SetParam("min_local_day", to_string(ruleParam._rerrpMinLocalDays));
		//	for (size_t j = 0; j < restPeriodList.size(); j++) {
		//		if (restPeriodList[j]->endTimeLoc < mp_it->first || restPeriodList[j]->startTimeLoc > mp_it->second)
		//			continue;
		//		time_t checkStart = restPeriodList[j]->startTimeLoc;
		//		time_t checkEnd = restPeriodList[j]->endTimeLoc;
		//		if (checkStart < mp_it->first)
		//			checkStart = mp_it->first;
		//		if (checkEnd > mp_it->second)
		//			checkEnd = mp_it->second;
		//		if (ruleParam.IsRERRP(checkStart, checkEnd) && ruleParam.MatchMinLocalDays(checkStart, checkEnd)) {
		//			std::shared_ptr<CREW_RERRP> restPeriod(new CREW_RERRP());
		//			
		//			restPeriod->startTimeLoc = checkStart;
		//			restPeriod->endTimeLoc  = checkEnd;
		//			rerrpList.push_back(restPeriod);
		//		}
		//	}

		//	if (rerrpList.empty()) {
		//		if (this->_application == ROSTER_OPTIMIZER) {
		//			return false;
		//		}
		//		_ruleViolation.SetParam("month", "1");
		//		ThrowRuleViolation();
		//		continue;
		//	}

		//	if (rerrpList.size() == 1 && (mp_it->first != rerrpList[0]->startTimeLoc || mp_it->second != rerrpList[0]->endTimeLoc)) {
		//		if (this->_application == ROSTER_OPTIMIZER) {
		//			return false;
		//		}
		//		_ruleViolation.SetParam("month", "1");
		//		ThrowRuleViolation();
		//		continue;
		//	}

		//	if (rerrpList.size() > 1) {
		//		/*int count = 0;
		//		for (size_t z = 0; z < rerrpList.size() - 1; z++) {
		//			if (!ruleParam.DurationOfRerrps(rerrpList[z]->startTimeLoc, rerrpList[z]->endTimeLoc)) {
		//				++count;
		//			}
		//		}*/
		//		if (rerrpList.size() < ruleParam._minRerrpNum) {
		//			if (this->_application == ROSTER_OPTIMIZER) {
		//				return false;
		//			}
		//			_ruleViolation.SetParam("month", "1");
		//			ThrowRuleViolation();
		//		}
		//	}
		//}
	}
	

	return isValid;
}



void RecurrentExtendedRecoveryRestPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RecurrentExtendedRecoveryRestPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}


void RecurrentExtendedRecoveryRestPeriodRule::ThrowRuleViolation() const {
	string errorMsg = "";
	//Maximum of {0:space_hours} hours allowed between reserve periods. Crew must have {1:min_rerrp} reserve periods and include {2:min_local_day} local days.
	if (!_ruleViolation.GetParam("space").empty()) {
		errorMsg += "Maximum of " + _ruleViolation.GetParam("space_hours") + " hours allowed between reserve periods.";
	}
	if (!_ruleViolation.GetParam("month").empty()) {
		errorMsg += "Crew must have " + _ruleViolation.GetParam("min_rerrp") + " reserve periods and include " + _ruleViolation.GetParam("min_local_day") + " local days.";
	}

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->idRule = _ruleParams[0].GetId();
	rv->description = _ruleParams[0].GetDescription();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}
