/**
 * @file LimitAreaEntryCountForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-11
**/

#include "../RuleSytem.h"
#include "LimitAreaEntryCountForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

bool LimitAreaEntryCountForPRRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	std::string base = pairing->getBase();
	if (this->IsPairingOptimizerModel()) {
		base = pairing->getDutyVec().front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	for (auto& ruleParam : this->_ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		if (ruleParam._checkMode == "D") {
			// if check mode is D, check each duty
			for (auto duty : pairing->getDutyVec()) {
				auto segments = duty->getSegments();
				bool valid = CheckRule(segments, base, ruleParam);
				if (!valid) {
					passAllRule = false;
					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
		else {
			// if check mode is P, * or empty, check pairing
			auto segments = const_cast<Pairing*>(pairing)->getSegments();
			bool valid = CheckRule(segments, base, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
        }

	}
	return passAllRule;
}

bool LimitAreaEntryCountForPRRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duty->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
	else {
        auto iterPair = _dbData->pairingIdMap.find(duty->getPairingId());
		if (iterPair != _dbData->pairingIdMap.end() && iterPair->second != nullptr) {
            base = iterPair->second->getBase();
		}
	}

	bool passAllRule = true;
	for (auto& ruleParam : this->_ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(duty->getSegmentsRead(), base, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool LimitAreaEntryCountForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		bool valid = CheckRule(roster->pairing);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}

	return passAllRule;
}

bool LimitAreaEntryCountForPRRule::CheckRule(const vector<Segment*>& segments, const string& base, const LimitAreaEntryCountForPRRuleParam& ruleParam) const {
	bool valid = true;
	if (ruleParam.MatchPairingHomeBase(base)) {
		int actualEntryTimes = RosterUtils::GetActualEntryTimes(segments, ruleParam._airportAreas);
		if (actualEntryTimes > ruleParam._entryTimes) {
			valid = false;
			ThrowRuleViolation(segments.front(), segments.back(), actualEntryTimes, ruleParam);
		}
	}
	return valid;
}

void LimitAreaEntryCountForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitAreaEntryCountForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitAreaEntryCountForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitAreaEntryCountForPRRule::ThrowRuleViolation(const Segment* firstSegment, const Segment* lastSegment, const int actualEntryTimes, const LimitAreaEntryCountForPRRuleParam& ruleParam) const {
	string msg = "Crew is only allowed to enter the defined area ({0:airportAreas}) ({1:entryTimes}) times.";
	msg = StringUtils::Format(msg, ruleParam._strAirportAreas, ruleParam._entryTimes);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitAreaEntryCountForPRRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, firstSegment->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = firstSegment->getPairingId();
	rv->dutySequenceNumber = firstSegment->getDutySeq();
	rv->startDTUtc = firstSegment->getStartTimeUtcAct();
	rv->endDTUtc = lastSegment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}
