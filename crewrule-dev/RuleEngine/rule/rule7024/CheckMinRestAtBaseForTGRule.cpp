/**
 * @file CheckMinRestAtBaseForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/

#include <algorithm>

#include "../RuleSytem.h"
#include "CheckMinRestAtBaseForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

bool CheckMinRestAtBaseForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

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
	int baseOffsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());
	_ruleViolation.SetParam("baseOffsetTZMinutes", StringUtils::itos(baseOffsetTZMinutes));

	bool passAllRule = true;
	bool next = true;

	for (size_t i = 0; i < rosters.size(); i++) {
		auto currRoster = rosters[i];
		auto nextRoster = (i == rosters.size() - 1) ? nullptr : rosters[i+1];
		if (currRoster->pairing == nullptr || nextRoster == nullptr) {
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(currRoster->rosterId));

		MinRestAtBaseForTGRuleParam* matchMaxParam = nullptr;
		int maxLocalNightNum = -1;
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				continue;
			}
			if (ruleParam.MatchParam(currRoster->pairing, nullptr, baseOffsetTZMinutes)) {
				if (ruleParam._minLocalNightNum > maxLocalNightNum) {
					maxLocalNightNum = ruleParam._minLocalNightNum;
					matchMaxParam = const_cast<MinRestAtBaseForTGRuleParam*>(&ruleParam);
				}
			}
		}

		if (matchMaxParam == nullptr) {
			continue;
		}
		if (!CheckRule(currRoster->pairing, nextRoster, baseOffsetTZMinutes, *matchMaxParam)) {
			ThrowRuleViolation(currRoster->pairing, *matchMaxParam);
		}
	}

	return passAllRule;
}

bool CheckMinRestAtBaseForTGRule::CheckRule(const Pairing* pairing, const ROSTER* nextRoster, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const {
	bool valid = true;
	time_t startTimeUtc = pairing->getEndTimeUtcAct();
	time_t endTimeUtc = nextRoster->getStartTimeUtcAct();
	int localNightNum = DutyUtils::GetLocalNightNums(startTimeUtc, endTimeUtc, offsetTZMinutes);
	return localNightNum >= ruleParam._minLocalNightNum;
}

void CheckMinRestAtBaseForTGRule::ParseParam(const InputType& input) {
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

void CheckMinRestAtBaseForTGRule::ThrowRuleViolation(const Pairing* pairing, const MinRestAtBaseForTGRuleParam& ruleParam) const {
	std::string msg = "The number of local night is less than the min number of local night({0:minLocalNightNum}).";
	msg = StringUtils::Format(msg, ruleParam._minLocalNightNum);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	rv->pairingId = pairing->getDbId();
	rv->startDTUtc = pairing->getStartTimeUtcAct();
	rv->endDTUtc = pairing->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minLocalNightNum", StringUtils::itos(ruleParam._minLocalNightNum)));
	_ruleViolation.AddRuleViolations(rv);
}