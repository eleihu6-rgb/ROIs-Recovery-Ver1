/**
 * @file CheckDaysOffFor5JRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#include "../RuleSytem.h"
#include "CheckDaysOffFor5JRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"

#include <unordered_map>

bool CheckDaysOffFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	string zoneId = this->_dbData->airportZoneIdMap[base];
	time_t scenarioStart = RosterUtils::GetScenarioStartLoc(crew, this->_dbData);
	time_t scenarioEnd = RosterUtils::GetScenarioEndLoc(crew, this->_dbData);
	int offsetMinutes = TimezoneUtils::GetTimezoneOffset(scenarioStart, zoneId);
	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crew->idCrew);
		_ruleViolation.SetParam("zoneId", zoneId);
		string checkMode = _ruleParam.GetCheckPeriod();
		if (checkMode == "CM") {
			auto mp = Utility::GetInstancePtr()->getMonthRollingWindows(scenarioStart, scenarioEnd + 24 * 3600, offsetMinutes, 1);
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
				time_t start = mp_it->first + offsetMinutes * 60;
				time_t end = mp_it->second + offsetMinutes * 60;
				if (start >= scenarioStart && end <= scenarioEnd) {
					passAllRule = CheckDaysOffByStartAndEnd(rosters, start, end, base, _ruleParam);
				}
			}
		}
		else {
			for (const auto& rp : this->_dbData->rosterPeriodList) {
				if (rp.rp_end < scenarioStart || rp.rp_start > scenarioEnd)
					continue;
				bool isFullRP = false;//RP鏁翠釜鏃堕棿娈垫槸鍚﹀湪鍦烘櫙鍐?
				if (rp.rp_start >= scenarioStart && rp.rp_end < scenarioEnd) {
					isFullRP = true;
				}
				//璁＄畻RP鍛ㄦ湡
				time_t rosterPeriodStart = rp.rp_start;
				time_t rosterPeriodEnd = rp.rp_end + 24 * 3600 - 1;
				passAllRule = CheckDaysOffByStartAndEnd(rosters, rosterPeriodStart, rosterPeriodEnd, base, _ruleParam);
			}
		}
	}

	return passAllRule;
}

bool CheckDaysOffFor5JRule::CheckDaysOffByStartAndEnd(const std::vector<const ROSTER*>& rosters, const time_t checkStart, const time_t checkEnd, const string base, const CheckDaysOffFor5JRuleParam ruleParam) const {
	//std::vector<std::unique_ptr<RestPeriod>> restPeriods;
	std::vector<std::unique_ptr<RestPeriod>> restPeriods = ruleParam.GetRestPeriods(rosters, base, checkStart, checkEnd, this->_dbData);

	// 鍏堟牴鎹?Definition 涓殑 Unavailable Assignment Groups 鍜?Unavailable Assignments 绠楀嚭 Check Period 鍐呯殑 Unavailable 澶╂暟
	int unavailableDays = 0;
	for (const auto& definitionRuleParam : ruleParam.GetDefinitionParams()) {
		unavailableDays = definitionRuleParam.GetUnavailableDaysByRosters(rosters, checkStart, checkEnd, this->_dbData);
		break; // 鍙娇鐢ㄧ涓€涓?Definition 鍙傛暟
	}

	// 鏍规嵁 Unavailable 澶╂暟鍘?Second 涓壘鍑哄搴旂殑 min days off
	for (const auto& secondRuleParam : ruleParam.GetSecondCaseParams()) {
		const int minDaysOff = secondRuleParam.GetMinDaysOffByUnavailableDays(unavailableDays);
		if (minDaysOff > 0) {
			const int actDaysOff = GetActualDaysOffByRestPeriods(restPeriods, checkStart, checkEnd);
			if (actDaysOff < minDaysOff) {
				if (this->_application == ROSTER_OPTIMIZER) {
					return false;
				}
				_ruleViolation.SetParam("start", to_string(checkStart));
				_ruleViolation.SetParam("end", to_string(checkEnd));
				_ruleViolation.SetParam("minDaysOff", to_string(minDaysOff));
				_ruleViolation.SetParam("actDaysOff", to_string(actDaysOff));

				ThrowRuleViolation();
			}
		}
	}
	return true;
}

void CheckDaysOffFor5JRule::ThrowRuleViolation() const {
	time_t start = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t end = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string zoneId = _ruleViolation.GetParam("zoneId");
	string crewId = _ruleViolation.GetParam("crew_id");
	string actDaysOff = _ruleViolation.GetParam("actDaysOff");
	string minDaysOff = _ruleViolation.GetParam("minDaysOff");
	string msg = "Require({0:minDaysOff}), reached ({1:actDaysOff}).";
	msg = StringUtils::Format(msg, minDaysOff, actDaysOff);

	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = crewId;

	rv->startDTUtc = TimezoneUtils::GetUTCTime(start, zoneId);
	rv->endDTUtc = TimezoneUtils::GetUTCTime(end, zoneId);
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448鎻愪緵message鍙傛暟缁檊antt
	//rv->operation_result.insert(pair<string, string>("rosterDaysOff", Utility::GetInstancePtr()->ToString(count)));
	_ruleViolation.AddRuleViolations(rv);
}

int CheckDaysOffFor5JRule::GetActualDaysOffByRestPeriods(const std::vector<std::unique_ptr<RestPeriod>>& restPeriods,
	const time_t checkStart,
	const time_t checkEnd) const {
	int days = 0;
	const time_t checkEndExclusive = checkEnd + 1;
	for (const auto& restPeriod : restPeriods) {
		const time_t clippedStart = std::max(restPeriod->GetStartTimeLoc(), checkStart);
		const time_t clippedEnd = std::min(restPeriod->GetEndTimeLoc(), checkEndExclusive);
		if (clippedEnd <= clippedStart) {
			continue;
		}
		days += TimeUtils::CalculateFullDaysBetweenTimes(clippedStart, clippedEnd);
	}
	return days;
}

void CheckDaysOffFor5JRule::ParseParam(const InputType& input) {
	_ruleParams.clear();
	if (input.dbRules.empty()) {
		return;
	}

	std::unordered_map<long long, std::size_t> indexByRuleId;
	indexByRuleId.reserve(input.dbRules.size());

	for (const auto& dbRule : input.dbRules) {
		const long long ruleId = dbRule.idRule;
		auto it = indexByRuleId.find(ruleId);
		if (it == indexByRuleId.end()) {
			_ruleParams.emplace_back(CheckDaysOffFor5JRuleParam(this));
			it = indexByRuleId.emplace(ruleId, _ruleParams.size() - 1).first;
		}

		auto& ruleParam = _ruleParams[it->second];
		ruleParam.ParseParam(dbRule);
	}
}
