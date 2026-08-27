/**
 * @file AcclimatizationForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AcclimatizationForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "TimezoneUtils.h"
#include "../constant/Constants.h"

using namespace std;

void AcclimatizationForHXRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void AcclimatizationForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_acclimatizationStateParam->ParseParam(dbRule);
	}
	else {
		_recoveryPeriodParams.emplace_back(RecoveryPeriodForHXParam(this->GetRule()));
		auto& newParam = _recoveryPeriodParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool AcclimatizationForHXRuleParam::MatchTimeZoneDiff(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty起飞和落地地点的时差
	int dutyTimeZoneDiff = DutyUtils::GetTimeZoneDiff(lastAcclimatisedDuty, duty, dbData);
	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _acclimatizationStateParam->_timezoneDiffMinutesLower
			&& absDutyTimeZoneDiff < _acclimatizationStateParam->_timezoneDiffMinutesUpper) {
		return true;
	}
	return false;
}

