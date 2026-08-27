/**
 * @file CumulativeFtLimitForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckCumulativeFtLimitForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../period/WorkPeriod.h"
#include "../period/SlideWindow.h"
#include "TimezoneUtils.h"


bool CheckCumulativeFtLimitForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	int offsetTZMinutes = GetTimeZoneOffset(checkedStartTime, crew);
	_ruleViolation.SetParam("offsetTZMinute", StringUtils::itos(offsetTZMinutes));

	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		//获得工作时间
		std::vector<std::unique_ptr<WorkPeriod>> workPeriods = std::move(WorkPeriod::GetWorkPeriods(rosters, this->_dbData));
		std::vector<std::unique_ptr<Period>> periods;
		for (auto& workPeriod : workPeriods) {
			periods.push_back(std::move(workPeriod));
		}
		if (workPeriods.empty()) {
			return passAllRule;
		}

		SlideWindow slideWindow;
		CumulativeFtLimitSlideListener lister(this);

		_ruleViolation.SetRuleParam(ruleParam);

		passAllRule = slideWindow.Slide(checkedStartTime, checkedEndTime, offsetTZMinutes, periods, ruleParam._timePeriod, ruleParam._timePeriodUnit, lister, (void*)(&ruleParam));
		if (!passAllRule) {
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool CheckCumulativeFtLimitForEvaFdRule::CheckRule(const long blhTotalMinutes, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, const CumulativeFtLimitForEvaFdRuleParam& ruleParam) const {
	_ruleViolation.SetParam("startTimeLoc", StringUtils::lltos((long long)windowStartLoc));
	_ruleViolation.SetParam("endTimeLoc", StringUtils::lltos((long long)windowEndLoc));
	_ruleViolation.SetParam("period", StringUtils::itos(ruleParam._timePeriod));
	_ruleViolation.SetParam("periodType", ruleParam._timePeriodUnit);
	_ruleViolation.SetParam("maxFT", ruleParam._maxFT);
	_ruleViolation.SetParam("blhTotalMinutes", TimeUtils::MinutesTohhmm(blhTotalMinutes));

	if (blhTotalMinutes > ruleParam._maxFTMinutes) {
		ThrowRuleViolation();
		return false;
	}
	return true;
}

int CheckCumulativeFtLimitForEvaFdRule::GetTimeZoneOffset(const time_t baseUtcTime, const std::shared_ptr<CREW>& crew) const {
	string station = crew->getPrimeBase();
	string airlinecode = this->GetDataContext()->scenario.airline;
	if (airlinecode == "BR") {
		//针对长荣，需求要求固定为 TPE 机场时区时间
		station = "TPE";
	}
	string depZoneId = this->GetDataContext()->getAirportZoneId(station);
	int offset = TimezoneUtils::GetTimezoneOffset(baseUtcTime, depZoneId);
	return offset;
}

void CheckCumulativeFtLimitForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CumulativeFtLimitForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CumulativeFtLimitForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckCumulativeFtLimitForEvaFdRule::ThrowRuleViolation() const{
	time_t startLoc = StringUtils::stoi(_ruleViolation.GetParam("startTimeLoc"), 0);
	time_t endLoc = StringUtils::stoi(_ruleViolation.GetParam("endTimeLoc"), 0) - 1;
	int offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);
	time_t startUtc = startLoc - offsetTZMinute * 60;
	time_t endUtc = endLoc - offsetTZMinute * 60;
	
	string startLocStr = TimeUtils::Format(startLoc, "yyyy-mm-dd HH:mm");
	string endLocStr = TimeUtils::Format(endLoc, "yyyy-mm-dd HH:mm");

	string blhTotalMinutes = _ruleViolation.GetParam("blhTotalMinutes");
	string maxFT = _ruleViolation.GetParam("maxFT");
	string period = _ruleViolation.GetParam("period");
	string periodType = _ruleViolation.GetParam("periodType");

	std::string msg = "[{0:start} - {1:end}] Cumulative flight time({ 2:blhTotalMinutes }) is more than the maximum flight time({ 3:maxFT }) limitation " \
		"in this {4:period} {5:periodType} window.";
	msg = StringUtils::Format(msg, startLocStr.c_str(), endLocStr.c_str(),
		blhTotalMinutes, maxFT, period, periodType);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->pairingId = -1;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("startLocStr", startLocStr));
	rv->operation_result.insert(pair<string, string>("endLocStr", endLocStr));
	rv->operation_result.insert(pair<string, string>("blhTotalMinutes", blhTotalMinutes));
	rv->operation_result.insert(pair<string, string>("maxFT", maxFT));
	rv->operation_result.insert(pair<string, string>("period", period));
	rv->operation_result.insert(pair<string, string>("period_type", periodType));
	_ruleViolation.AddRuleViolations(rv);
}

bool CumulativeFtLimitSlideListener::OnSlide(bool& next, bool& ignoreSlide, const Period* period, const Period* nextPeriod, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, void* param, ...) const {
	CumulativeFtLimitForEvaFdRuleParam* ruleParam = (CumulativeFtLimitForEvaFdRuleParam*)param;
	next = true;
	bool isValid = true;

	bool changed = !isSameWindow(windowStartLoc, windowEndLoc);
	bool isLast = (nextPeriod == nullptr); //最后一个
	if (_BLHTotalMinutes > 0 && (changed || isLast)) {
		//滚动窗户发生变化，或者是最后一个，则进行检查
		isValid = _rule->CheckRule(_BLHTotalMinutes, _currWindowStart, _currWindowEnd, offsetTZMinutes, *ruleParam);
	}

	//滚动窗户变化，则重新统计。
	if (changed) {
		_currWindowStart = windowStartLoc;
		_currWindowEnd = windowEndLoc;
		_BLHTotalMinutes = 0;
	}

	//累计飞时
	const std::shared_ptr<CrewDataContext>& dbData = this->_rule->GetDataContext();
	WorkPeriod* workPeriod = (WorkPeriod*)period;
	if (workPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* duty = (Duty*)workPeriod->GetWork();
		if (ruleParam->MatchAssignments(*duty, _rule->GetDataContext())) {
			if (!ruleParam->MatchComposition(*duty)) {
				ignoreSlide = true;
				return isValid;
			}
			for (auto& segment : duty->getSegmentsRead()) {
				if (RosterUtils::ExistExceptionCode(workPeriod->GetRoster(), segment, ruleParam->GetExceptionCodes(), _rule->GetDataContext())) {
					continue;
				}

				time_t startTimeLoc = segment->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
				time_t endTimeLoc = segment->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
				if ((startTimeLoc >= windowStartLoc && startTimeLoc <= windowEndLoc) 
					|| (endTimeLoc >= windowStartLoc && endTimeLoc <= windowEndLoc)) {
					startTimeLoc = startTimeLoc < windowStartLoc ? windowStartLoc : startTimeLoc;
					endTimeLoc = endTimeLoc > windowEndLoc ? windowEndLoc : endTimeLoc;
					int blhInSec = static_cast<int>(endTimeLoc - startTimeLoc);

					if (dbData->assignmentNameMap.find(segment->getAssignment()) != dbData->assignmentNameMap.end())
					{
						SharedPtr<ASSIGNMENT> assignment = dbData->assignmentNameMap[segment->getAssignment()];
						if (assignment != nullptr)
							blhInSec = (int)(blhInSec * assignment->BT_PCT);
					}

					_BLHTotalMinutes += (blhInSec / 60);
				}

			}
			
		}
	}

	return isValid;
}
