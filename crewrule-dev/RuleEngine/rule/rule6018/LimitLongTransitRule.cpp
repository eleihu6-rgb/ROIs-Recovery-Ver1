/**
 * @file LimitLongTransitRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitLongTransitRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool LimitLongTransitRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool LimitLongTransitRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitLongTransitRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	bool next = true;
	for (auto& duty : duties) {
		
		if (RuleParams::GetInstancePtr()->isLongTransit(duty)) {
			//判断X基地航班在X机场能否长中转（前提是Split Duty）
			for (const auto & ruleParam : _ruleParams) {
				_ruleViolation.SetRuleParam(ruleParam);
				_ruleViolation.SetParam("homeBase", ruleParam._strPairingBases);
				bool valid = CheckRule(next, duty, base, ruleParam);
				if (!valid) {
					passAllRule = false;
				}
				if (!next) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitLongTransitRule::CheckRule(bool& next, const Duty* duty, const std::string& base,
	const LimitLongTransitRuleParam& ruleParam) const {
	bool valid = true;
	for (int i = 0; i < (int)duty->getNumSegments() - 1; i++) {
		Segment* currSegment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		if (ruleParam.MatchParam(*currSegment, *nextSegment, base)) {
			if (!ruleParam.CheckParam(*currSegment)) {
				valid = false;
				ThrowLongTransitRuleViolation(duty, currSegment);
			}
			next = false;
			break;
		}
	}
	return valid;
}

void LimitLongTransitRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitLongTransitRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitLongTransitRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitLongTransitRule::ThrowLongTransitRuleViolation(const Duty* duty, const Segment* segment) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	std::string msg = "Long transit at station ({0:station}) is not allowed from home base ({1:homeBase}).";
	msg = StringUtils::Format(msg, segment->getArrStation(), homeBase);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitLongTransitRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->segmentId = segment->getSegmentId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitLongTransitRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("station", segment->getArrStation()));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}
