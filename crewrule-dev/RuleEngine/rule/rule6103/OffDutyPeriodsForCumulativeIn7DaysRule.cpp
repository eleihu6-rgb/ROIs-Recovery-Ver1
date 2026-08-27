/**
 * @file OffDutyPeriodsForCumulativeIn7DaysRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "OffDutyPeriodsForCumulativeIn7DaysRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../period/RestPeriod.h"


bool OffDutyPeriodsForCumulativeIn7DaysRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	for (const auto & ruleParam : _ruleParams) {

		std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		std::vector<std::unique_ptr<RestPeriod>> restPeriods = RestPeriod::GetRestPeriods(rosters,
			ruleParam._dayOffAssignmentGroups, ruleParam._isUtilizePostDutyRest,
			ruleParam._isUltilizeLayover, ruleParam._isCountBlankDay,
			this->_dbData);

		for (auto roster : rosters) {

			Pairing* pairing = nullptr;
			if (roster->pairId != 0 && _dbData->pairingIdMap.find(roster->pairId) != _dbData->pairingIdMap.end()) {
				pairing = _dbData->pairingIdMap[roster->pairId];
			}
			if (pairing == nullptr) {
				//TODO 地面任务如何处理？？？？ by hexd
				continue;
			}
			bool valid = CheckRule(pairing, restPeriods, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
				_ruleViolation.SetRuleParam(ruleParam);
				ThrowRuleViolation();
			}
		}
	}
	return passAllRule;
}

bool OffDutyPeriodsForCumulativeIn7DaysRule::CheckRule(const Pairing* pairing, 
	const std::vector<std::unique_ptr<RestPeriod>>& restPeriods, 
	const OffDutyPeriodsForCumulativeIn7DaysRuleParam& ruleParam) const {

	for (auto duty : pairing->getDutyVec()) {
		if (!ruleParam.MatchAssignmentGroups(duty->getAssignment(), this->_dbData)) {
			continue;
		}
		if (!CheckRule(duty, restPeriods, ruleParam)) {
			return false;
		}
	}
	return true;
}

bool OffDutyPeriodsForCumulativeIn7DaysRule::CheckRule(const Duty* duty, const std::vector<std::unique_ptr<RestPeriod>>& restPeriods,
	const OffDutyPeriodsForCumulativeIn7DaysRuleParam& ruleParam) const {
	
	bool isAllPreAssigned = RestPeriod::IsAllPreAssign(restPeriods);
	if (this->IsRosterOptimizerModel() && (isAllPreAssigned)) {
		return true;
	}


	//以Duty起飞机场时区为基准时区，这里转化成秒 by hexd 可能不对
	int offsetTZMinute = DutyUtils::GetTimeZoneOffset(*duty, _dbData);

	time_t endTimeUtc = GetEndTimeForDuty(duty, ruleParam._checkPeriodStartOrEnd, ruleParam._timePeriodUnit, offsetTZMinute);
	time_t startTimeUtc = endTimeUtc - ruleParam._timePeriod * Period::GetPeriodUnitSize(ruleParam._timePeriodUnit);

	_ruleViolation.SetParam("startTimeUtc", StringUtils::lltos((long long)startTimeUtc));
	_ruleViolation.SetParam("endTimeUtc", StringUtils::lltos((long long)endTimeUtc));
	_ruleViolation.SetParam("offsetTZMinute", StringUtils::itos(offsetTZMinute));
	_ruleViolation.SetParam("period", StringUtils::itos(ruleParam._timePeriod));
	_ruleViolation.SetParam("periodType", ruleParam._timePeriodUnit);
	_ruleViolation.SetParam("minRest", StringUtils::itos(ruleParam._minRest));
	_ruleViolation.SetParam("minLocalNight", StringUtils::itos(ruleParam._minLocalNight));
	_ruleViolation.SetParam("pairingId", StringUtils::lltos(duty->getPairingId()));
	_ruleViolation.SetParam("dutyId", StringUtils::lltos(duty->getDutyId()));

	return CheckRule(startTimeUtc, endTimeUtc, restPeriods, ruleParam._minLocalNight, ruleParam._minRest, offsetTZMinute);
}

bool OffDutyPeriodsForCumulativeIn7DaysRule::CheckRule(const time_t startTimeUtc, const time_t endTimeUtc,
	const std::vector<std::unique_ptr<RestPeriod>>& restPeriods, 
	const unsigned int minLocalNight, const unsigned int minRest, const int offsetTZMinute) const {
	int maxRestTime = INT_MIN;
	int localNightNum = 0;

	for (auto& restPeriod : restPeriods) {
		time_t restStartTimeUtc = restPeriod->GetStartTimeUTC();
		time_t restEndTimeUtc = restPeriod->GetEndTimeUTC();
		if (restStartTimeUtc < startTimeUtc) {
			restStartTimeUtc = startTimeUtc;
		}
		if (restEndTimeUtc > endTimeUtc) {
			restEndTimeUtc = endTimeUtc;
		}
		int restTime = static_cast<int>(restEndTimeUtc - restStartTimeUtc);
		if (restTime < 0) {
			restTime = 0;
		}
		if (restTime > maxRestTime) {
			maxRestTime = restTime;
		}
		localNightNum += GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, minLocalNight, offsetTZMinute);
		if (maxRestTime >= (int)minRest*60*60 && localNightNum >= (int)minLocalNight) {
			return true;
		}
	}
	_ruleViolation.SetParam("maxRest", StringUtils::itos(maxRestTime));
	_ruleViolation.SetParam("maxLocalNightNum", StringUtils::itos(localNightNum));
	return false;
}

int OffDutyPeriodsForCumulativeIn7DaysRule::GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, 
	const unsigned int minLocalNight, const int offsetTZMinute) const {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(startTimeUtc, endTimeUtc, minLocalNight, local_night, offsetTZMinute);
	return numberOfLocalNighs;
}

time_t OffDutyPeriodsForCumulativeIn7DaysRule::GetEndTimeForDuty(const Duty* duty, 
	const std::string& checkPeriodStartOrEnd, const std::string& timePeriodUnit,
	const int offsetTZMinute) const {
	time_t end = const_cast<Duty*>(duty)->getEndTimeUtcAct();
	if (checkPeriodStartOrEnd == "S") {
		end = const_cast<Duty*>(duty)->getStartTimeUtcAct();
	}
	if (timePeriodUnit == "RH") {
		end = TimeUtils::Ceil(end, offsetTZMinute, ChronoUnit::HOURS);
	}
	else if (timePeriodUnit == "CD") {
		end = TimeUtils::Ceil(end, offsetTZMinute, ChronoUnit::DAYS);
	}

	return end;
}

void OffDutyPeriodsForCumulativeIn7DaysRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(OffDutyPeriodsForCumulativeIn7DaysRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(OffDutyPeriodsForCumulativeIn7DaysRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void OffDutyPeriodsForCumulativeIn7DaysRule::ThrowRuleViolation() const{
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("startTimeUtc"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("endTimeUtc"), 0) - 1;
	time_t offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(startUtc + offsetTZMinute * 60, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(endUtc + offsetTZMinute * 60, endUtcStr, sizeof(endUtcStr));

	int iMaxRest = StringUtils::stoi(_ruleViolation.GetParam("maxRest"), 0) / 60 ; //转化成分钟数
	//string msg = "[" + string(startUtcStr) + " - " + string(endUtcStr) + "] Only " + Utility::GetInstancePtr()->iToa(iMaxRest / 60) + ":";
	string minRest = _ruleViolation.GetParam("minRest");
	string period = _ruleViolation.GetParam("period");
	string periodType = _ruleViolation.GetParam("periodType");
	string minLocalNight = _ruleViolation.GetParam("minLocalNight");
	string maxLocalNightNum = _ruleViolation.GetParam("maxLocalNightNum");
	//msg += Utility::GetInstancePtr()->iToa(iMaxRest % 60) + " rest < " + minRest + " hours in this " + period + " " + periodType + " window.";

	std::string msg = "[{0:start} - {1:end}] In this {2:period} {3:periodType} window, \
			there is only {4:iMaxRestHours}:{5:iMaxRestMinute} of rest which is less than {6:minRest} hours \
			or there are {7:maxLocalNightNum} local nights which is less than the minimum of {8:minLocalNight} days.";
	msg = StringUtils::Format(msg, startUtcStr, endUtcStr, period, periodType,
		Utility::GetInstancePtr()->iToa(iMaxRest / 60), Utility::GetInstancePtr()->iToa(iMaxRest % 60), 
		minRest, maxLocalNightNum, minLocalNight);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->pairingId = std::stoll(_ruleViolation.GetParam("pairingId"));
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("iMaxRest", Utility::GetInstancePtr()->iToa(iMaxRest / 60)));
	rv->operation_result.insert(pair<string, string>("min_rest", minRest));
	rv->operation_result.insert(pair<string, string>("period", period));
	rv->operation_result.insert(pair<string, string>("period_type", periodType));
	_ruleViolation.AddRuleViolations(rv);
}