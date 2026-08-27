/**
 * @file CheckDaysOffForTradeRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckDaysOffForTradeRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckDaysOffForTradeRule::CheckRule(vector<SharedPtr<ROSTER>>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crew = this->_dbData->crewIdMap.at(rosters[0]->idcrew);
	bool isFd = crew->division == "P";
	
	time_t rollingWindow_start, rollingWindow_end;

	rollingWindow_start = this->_dbData->scenario.startDtUTC;
	rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;

	int offsetMinutes = 0;
	int iDaysOff;
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);

		vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
		vector<string> daysOffs;
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
		{
			if (_ruleParam._doAssignmentGroups.empty() || _ruleParam._doAssignmentGroups[0] == "*" || find(_ruleParam._doAssignmentGroups.begin(), _ruleParam._doAssignmentGroups.end(), (*assignment)->assignmentGroup) != _ruleParam._doAssignmentGroups.end())
			{
				daysOffs.push_back((*assignment)->assignemnt);
			}
		}

		map<time_t, time_t> mp;
		//判断是否在同一年中
		const auto& startYear = TimeUtils::GetYear(rosters[0]->getStartTimeLocAct());
		const auto& endYear = TimeUtils::GetYear(rosters[rosters.size() - 1]->getStartTimeLocAct());
		const auto& diffYear = endYear - startYear;
		for (size_t i = 0; i <= diffYear; i++) {

			const auto& startTime = makeTimeT(startYear + (int)i, _ruleParam._startMonth, 1, 0, 0, 0);
			const auto& endTime = makeTimeT(startYear + (int)i, _ruleParam._endMonth + 1, 1, 0, 0, 0) - 1;
			mp.insert(pair<time_t, time_t>(startTime, endTime));
		}
		time_t start, end;
		
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
			start = (*mp_it).first;
			end = (*mp_it).second;
			
			if (!_ruleParam.MatchCrewQualification(crew, start, end))
				continue;
			if (this->_application == ROSTER_OPTIMIZER && (end < rollingWindow_start || start > rollingWindow_end))
				continue;

			string tempBase = Utility::GetInstancePtr()->getCrewPrimaryBaseByLoc(crew->baseList, start);
			
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(tempBase);
				
			time_t startUtc = start - offsetMinutes * 60;
			time_t endUtc = end - offsetMinutes * 60;

			if (!_ruleParam._countBlankDay)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, startUtc, endUtc);
			else
				//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, rPostRest, start, end);
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, startUtc, endUtc, offsetMinutes, _ruleParam._countBlankDay, _ruleParam._utilizePostDutyRest, this->_dbData->airportCodeMap, _ruleParam._layoverTimemode, 1, _ruleParam._countLayover, tempBase);
			if (isFd)
				iDaysOff += _ruleParam.GetDaysOffByMandayFD(crew->mandayFdList, startUtc, endUtc, rosters[0]->getStartTimeLocAct(), rosters[rosters.size() - 1]->getEndTimeLocAct());
			else
				iDaysOff += _ruleParam.GetDaysOffByMandayCC(crew->mandayCcAmList, startUtc, endUtc, rosters[0]->getStartTimeLocAct(), rosters[rosters.size() - 1]->getEndTimeLocAct());

			if (iDaysOff < _ruleParam._minDO) {
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("start", to_string(startUtc));
				_ruleViolation.SetParam("end", to_string(endUtc));
				_ruleViolation.SetParam("actDaysoff", to_string(iDaysOff));
				_ruleViolation.SetParam("minDo", to_string(_ruleParam._minDO));
				_ruleViolation.SetParam("startMonth", to_string(_ruleParam._startMonth));
				_ruleViolation.SetParam("endMonth", to_string(_ruleParam._endMonth));
				ThrowRuleViolation();
				passAllRule = false;
			}
		}
		/*if (!_ruleParam.MatchCrewQualification(crew, rollingWindow_start, rollingWindow_end))
			continue;
		int number = 0;
		number += _ruleParam.GetDaysOffByRosters(rosters);*/
		
	}

	return passAllRule;

}

void CheckDaysOffForTradeRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& actDaysoff = stoi(_ruleViolation.GetParam("actDaysoff"));
	const auto& minDo = stoi(_ruleViolation.GetParam("minDo"));
	const auto& startMonth = stoi(_ruleViolation.GetParam("startMonth"));
	const auto& endMonth = stoll(_ruleViolation.GetParam("endMonth"));
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msg = "The number of days off({0:actDaysoff}) must be at least {1:minDo} in {2:startMonth} to {3:endMonth} month";
	msg = StringUtils::Format(msg, actDaysoff, minDo, startMonth, endMonth);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckDaysOffForTradeRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckDaysOffForTradeRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
