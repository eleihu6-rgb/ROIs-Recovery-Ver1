/**
 * @file CalculateMinRestAtBaseForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-31
**/

#include "../RuleSytem.h"
#include "CalculateMinRestAtBaseForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestAtBaseForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty() || pairing == nullptr) {
		return;
	}

	std::string base = pairing->getBase(); // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = pairing->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	int baseOffsetTZMinutes = RosterUtils::GetTimeZoneOffset(pairing->getStartTimeUtcAct(), base, this->GetDataContext());
	MinRestAtBaseForTGRuleParam* matchMaxParam = nullptr;
	int maxLocalNightNum = -1;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		if (ruleParam.MatchParam(pairing, nullptr, baseOffsetTZMinutes)) {
			if (ruleParam._minLocalNightNum > maxLocalNightNum) {
				maxLocalNightNum = ruleParam._minLocalNightNum;
				matchMaxParam = const_cast<MinRestAtBaseForTGRuleParam*>(&ruleParam);
			}
		}
	}

	if (matchMaxParam != nullptr) {
		auto lastDuty = pairing->getLastDuty();
		CalculateDuty(lastDuty, baseOffsetTZMinutes, *matchMaxParam);
	}
}

void CalculateMinRestAtBaseForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
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

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	int baseOffsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	for (size_t i = 0; i < rosters.size(); i++) {
		auto currRoster = rosters[i];
		auto nextRoster = (i == rosters.size() - 1) ? nullptr : rosters[i + 1];
		if (currRoster->pairing == nullptr || nextRoster == nullptr) {
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
		CalculateDuty(lastDuty, baseOffsetTZMinutes, *matchMaxParam);
	}
}

bool CalculateMinRestAtBaseForTGRule::CalculateDuty(Duty* lastDuty, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const {
	time_t startTimeUtc = lastDuty->getLastDropoff()->getEndTimeUtcAct();
	time_t requireEndTimeUtc = DutyUtils::GetRestEndTimeMeetingNumLocalNights(startTimeUtc, offsetTZMinutes, "", ruleParam._minLocalNightNum);

	int minRest = static_cast<int>(requireEndTimeUtc - startTimeUtc) / 60;
	lastDuty->setMinRest(minRest);
	lastDuty->setMinRestAtBase(minRest);
	lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
	return true;
}

void CalculateMinRestAtBaseForTGRule::ParseParam(const InputType& input) {
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