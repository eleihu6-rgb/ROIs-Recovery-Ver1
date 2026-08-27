/**
 * @file LimitAircraftChangeRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitAircraftChangeRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool LimitAircraftChangeRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool LimitAircraftChangeRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitAircraftChangeRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

    std::string base; // left blank will use the context find pairing id from duty or segment
    if (this->IsPairingOptimizerModel()) {
        base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
    }

	bool passAllRule = true;
	bool next = true;
	for (std::size_t i = 0; i < duties.size(); ++i) {
		auto& duty = duties[i];

		//判断X基地航班在X机场中转能否换飞机
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			_ruleViolation.SetParam("acChgAllowed", ruleParam._strAcChgAllowed);
			_ruleViolation.SetParam("transitAirports", ruleParam._strTransitAirports);
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
	return passAllRule;
}


bool LimitAircraftChangeRule::CheckRule(bool& next, const Duty* duty,
                                           const std::string& base,
                                           const LimitAircraftChangeRuleParam& ruleParam) const {
	bool valid = true;
	next = true;
	for (int i = 0; i < (int)duty->getNumSegments() - 1; i++) {
		Segment* segment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		if (ruleParam.MatchParam(*segment, *nextSegment, base)) {
			LimitAircraftChangeRuleParam::WarnCode warnCode = ruleParam.CheckParam(*segment, *nextSegment);
			if (warnCode != LimitAircraftChangeRuleParam::WarnCode::NO_WARN) {
				valid = false;
				ThrowTransitRuleViolation(duty, segment, warnCode);
			}
			next = false;
			break;
		}
	}
	return valid;
}

void LimitAircraftChangeRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitAircraftChangeRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitAircraftChangeRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}


void LimitAircraftChangeRule::ThrowTransitRuleViolation(const Duty* duty, const Segment* segment
	, const LimitAircraftChangeRuleParam::WarnCode warnCode) const {
	string homeBase = _ruleViolation.GetParam("homeBase");
	string acChgAllowed = _ruleViolation.GetParam("acChgAllowed");
	string transitAirports = _ruleViolation.GetParam("transitAirports");

	string msg = "Aircraft change at station ({0:station}) is not allowed from home base ({1:homeBase}).";
	msg = StringUtils::Format(msg, segment->getArrStation(), homeBase);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitAircraftChangeRule::RuleFuncId;
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitAircraftChangeRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("station", segment->getArrStation()));
	rv->operation_result.insert(pair<string, string>("homeBase", homeBase));
	_ruleViolation.AddRuleViolations(rv);
}