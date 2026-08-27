/**
 * @file LimitFleetForStandbyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitFleetForStandbyRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool LimitFleetForStandbyRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(ruleParam);

		bool pass = CheckRule(rosters, crew, ruleParam);
		if (!pass) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitFleetForStandbyRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const LimitFleetForStandbyRuleParam& ruleParam) const {
	bool valid = true;
	for (auto roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing == nullptr) {
			continue;
		}
		
		for (auto& segment : roster->pairing->getSegments()) {
			if (ruleParam.MatchParam(*segment)) {
				if (!ruleParam.CheckCrewFleets(crew, roster->getStartTimeUtcAct(), roster->getRestStartUtcAct())) {
					valid = false;
					if (!IsCheckAllRule()) {
						return valid;
					}
					_ruleViolation.SetParam("requiredFleets", ruleParam._strRequiredFleets);
					ThrowRuleViolation(crew, roster->pairing, segment);
				}
			}
		}
	}
	return valid;
}


void LimitFleetForStandbyRule::ThrowRuleViolation(const std::shared_ptr<CREW>& crew, const Pairing* pairing, const Segment* segment) const {
	string strRequiredFleets = _ruleViolation.GetParam("requiredFleets");

	std::string msg = "Crew ({0:crewId}) needs to be qualified for fleets ({1:requiredFleets}) to operate the segment({2:fltNum}) on fleet({3:fltFleet}).";
	msg = StringUtils::Format(msg, crew->idCrew, strRequiredFleets, segment->getFlightNumber(), segment->getFleetCD());

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitFleetForStandbyRule::RuleFuncId;
	rv->pairingId = segment->getPairingId();
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, segment->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Pairing*>(pairing), msg);
	}
	rv->startDTUtc = pairing->getStartTimeUtcAct();
	rv->endDTUtc = pairing->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("requiredFleets", strRequiredFleets));
	rv->operation_result.insert(pair<string, string>("segmentFleet", segment->getFleetCD()));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitFleetForStandbyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitFleetForStandbyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitFleetForStandbyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}