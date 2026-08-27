/**
 * @file CalculateAccStartAtBaseForRTRule.cpp
 * @brief Implementation of acclimatization start state calculation for TG regulation 7024
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-12
 *
 * ============================================================================
 * FIELD USAGE ANALYSIS - Two Separate Fields
 * ============================================================================
 *
 * Duty has TWO separate fields for acclimatization state:
 *
 * 1. _acclimatisedState (ThreadLocal<string>, default="D")
 *    - Used by: EASA rules (Rule 7000)
 *    - Setter: setAcclimatisedState()
 *    - Getter: getAcclimatisedState()
 *    - Read by: JSON output, autoConfigDutyValues
 *    - THIS IS THE CORRECT FIELD TO SET
 *
 * 2. _accState (string, passthrough only)
 *    - Used by: Passthrough only, not processed by rules
 *    - Setter: setAccState()
 *    - Getter: getAccState()
 *    - NOT used by JSON output or autoConfigDutyValues
 *    - DO NOT USE THIS FIELD
 *
 * Data Flow:
 *   Rule sets: Duty::_acclimatisedState via setAcclimatisedState()
 *   autoConfigDutyValues reads: Duty::getAcclimatisedState() -> Roster::dutyValues
 *   JSON output reads: Duty::getAcclimatisedState()
 *
 * ============================================================================
 * CRITICAL: Must set BOTH Duty AND Roster
 * ============================================================================
 *
 * This rule sets both locations for consistency:
 *   1. Duty::_acclimatisedState (via setAcclimatisedState())
 *      - This is read by JSON output (JsonPairing.cpp line 1707)
 *   2. Roster::dutyValues.accState (via setAccState())
 *      - This is read by some downstream processes
 *
 * ============================================================================
**/

#include "../RuleSytem.h"
#include "CalculateAccStartAtBaseForRTRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateAccStartAtBaseForRTRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty() || pairing == nullptr) {
		return;
	}
	// TODO: Implementation will be added in subsequent tasks
}

void CalculateAccStartAtBaseForRTRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER) {
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	} else {
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	int baseOffsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	for (size_t i = 0; i < rosters.size(); i++) {
		auto currRoster = rosters[i];
		auto nextRoster = (i == rosters.size() - 1) ? nullptr : rosters[i + 1];
		if (currRoster->pairing == nullptr || nextRoster == nullptr || nextRoster->pairing == nullptr) {
			continue;
		}

		MinRestAtBaseForTGRuleParam* matchMaxParam = nullptr;
		int maxLocalNightNum = -1;
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				continue;
			}
			if (ruleParam.MatchParam(currRoster->pairing, nextRoster->pairing, baseOffsetTZMinutes)) {
				if (ruleParam._minLocalNightNum > maxLocalNightNum) {
					maxLocalNightNum = ruleParam._minLocalNightNum;
					matchMaxParam = const_cast<MinRestAtBaseForTGRuleParam*>(&ruleParam);
				}
			}
		}

		if (matchMaxParam == nullptr) {
			continue;
		}

		auto lastDuty = currRoster->pairing->getLastDuty();
		bool accStateSet = CalculateDuty(lastDuty, nextRoster, baseOffsetTZMinutes, *matchMaxParam);

		// Also set Roster's dutyValues for immediate consistency
		// Note: Duty::setAcclimatisedState() sets _acclimatisedState field (read by JSON)
		// This direct Roster setting provides immediate value for downstream processes
		// const_cast is safe: ROSTER objects are non-const at source (SharedPtr<ROSTER>)
		if (accStateSet && nextRoster != nullptr) {
			const_cast<ROSTER*>(nextRoster)->dutyValues.setAccState(0, AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);
			const_cast<ROSTER*>(nextRoster)->dutyValues.setAccStateForRestStart(0, AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);
			const_cast<ROSTER*>(nextRoster)->dutyValues.setRefTimeZone(0, baseOffsetTZMinutes);
			const_cast<ROSTER*>(nextRoster)->dutyValues.setETRTZ(0, -1);
			const_cast<ROSTER*>(nextRoster)->dutyValues.setTzDiffs(0, -1);
		}
	}
}

bool CalculateAccStartAtBaseForRTRule::CalculateDuty(Duty* lastDuty, const ROSTER* nextRoster, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const {
	if (lastDuty == nullptr || nextRoster == nullptr || nextRoster->pairing == nullptr) {
		return false;
	}

	auto nextDuty = nextRoster->pairing->getFirstDuty();
	if (nextDuty == nullptr) {
		return false;
	}

	// Get rest period start time (end of last duty's last dropoff) and end time (start of next duty)
	time_t restPeriodStartUtc = lastDuty->getLastDropoff()->getEndTimeUtcAct();
	time_t restPeriodEndUtc = nextDuty->getStartTimeUtcAct();

	// Calculate local nights during the rest period
	int localNightNum = DutyUtils::GetLocalNightNums(restPeriodStartUtc, restPeriodEndUtc, offsetTZMinutes);

	// Check if local nights meet the minimum requirement
	if (localNightNum >= ruleParam._minLocalNightNum) {
		// CRITICAL: Use setAcclimatisedState() to set _acclimatisedState field
		// This is the field read by JSON output (JsonPairing.cpp line 1707)
		// and by autoConfigDutyValues() for syncing to Roster::dutyValues
		nextDuty->setAcclimatisedState(AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);
		nextDuty->setAcclimatisedStateForRestStart(AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);
		nextDuty->setRefTimeZone(offsetTZMinutes);
		nextDuty->setETRTZ(-1);
		nextDuty->setTzDiffs(-1);
		return true;
	}

	return false;
}

void CalculateAccStartAtBaseForRTRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestAtBaseForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinRestAtBaseForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}