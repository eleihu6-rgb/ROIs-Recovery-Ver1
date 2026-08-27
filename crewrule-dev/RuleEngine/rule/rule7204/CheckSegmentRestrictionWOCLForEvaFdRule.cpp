/**
 * @file SegmentRestrictionWOCLForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckSegmentRestrictionWOCLForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"


bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	if (rosters.empty()) {
		return true;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->GetDataContext());
	return CheckRule(duties);
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (const auto & ruleParam : _ruleParams) {
		bool valid = CheckRule(duties, ruleParam);
		if (!valid) {
			passAllRule = false;
			break;
		}
	}
	return passAllRule;
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const vector<Duty*>& duties, const SegmentRestrictionWOCLForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;

	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* duty = duties.at(i);

		for (auto& dayNightRuleParam : ruleParam.GetSegmentRestrictionDayNightForEvaFdRuleParams()) {
			_ruleViolation.SetRuleParam(dayNightRuleParam);
			_ruleViolation.SetParam("maxSegmentNum", StringUtils::itos(dayNightRuleParam._maxSegmentNum));

			bool valid = CheckRule(duty, dayNightRuleParam);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolationForDayNight(duty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}

	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* duty = duties.at(i);

		for (auto& fdpNightRuleParam : ruleParam.GetSegmentRestrictionFDPNightForEvaFdRuleParams()) {
			_ruleViolation.SetRuleParam(fdpNightRuleParam);
			_ruleViolation.SetParam("maxSegmentNum", StringUtils::itos(fdpNightRuleParam._maxSegmentNum));

			bool valid = CheckRule(duty, fdpNightRuleParam);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolationForFDPNight(duty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const Duty* duty, const SegmentRestrictionDayNightForEvaFdRuleParam& ruleParam) const {
	if (ruleParam.MatchRule(*duty)) {
		if (!ruleParam.CheckRule(*duty)) {
			return false;
		}
	}
	return true;
}

bool CheckSegmentRestrictionWOCLForEvaFdRule::CheckRule(const Duty* duty, const SegmentRestrictionFDPNightForEvaFdRuleParam& ruleParam) const {
	if (ruleParam.MatchRule(*duty)) {
		if (!ruleParam.CheckRule(*duty)) {
			return false;
		}
	}
	return true;
}

void CheckSegmentRestrictionWOCLForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		if (_ruleParams.empty()) {
			_ruleParams.emplace_back(SegmentRestrictionWOCLForEvaFdRuleParam(this));
		}
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		if (_ruleParams.empty()) {
			_ruleParams.emplace_back(SegmentRestrictionWOCLForEvaFdRuleParam(this));
		}
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckSegmentRestrictionWOCLForEvaFdRule::ThrowRuleViolationForDayNight(const Duty* duty) const{
	string maxSegmentNum = _ruleViolation.GetParam("maxSegmentNum");
	string ftMinutes = _ruleViolation.GetParam("ftMinutes");
	string fdpMinutes = _ruleViolation.GetParam("fdpMinutes");

	std::string msg = "Composition[{0:compositionName}], BLH:[{1:ftMinutes}], FDP:[{2:fdpMinutes}], duty sector[{3:dutySegmentNum}] exceeds the maximum allowed number of sectors[{4:maxSegmentNum}]";
	msg = StringUtils::Format(msg, duty->getCompositionName(), ftMinutes, fdpMinutes, duty->getNumFlySegs(), maxSegmentNum);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckSegmentRestrictionWOCLForEvaFdRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("compositionName", duty->getCompositionName()));
	rv->operation_result.insert(pair<string, string>("dutySegmentNum", StringUtils::ltos(duty->getNumFlySegs())));
	rv->operation_result.insert(pair<string, string>("maxSegmentNum", maxSegmentNum));
	rv->operation_result.insert(pair<string, string>("ftMinutes", ftMinutes));
	rv->operation_result.insert(pair<string, string>("fdpMinutes", fdpMinutes));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckSegmentRestrictionWOCLForEvaFdRule::ThrowRuleViolationForFDPNight(const Duty* duty) const {
	string maxSegmentNum = _ruleViolation.GetParam("maxSegmentNum");
	string fdpStartTimeLoc = _ruleViolation.GetParam("fdpStartTimeLoc");
	string fdpEndTimeLoc = _ruleViolation.GetParam("fdpEndTimeLoc");

	std::string msg = "Composition[{0:compositionName}], FDP touched[{1:fdpStartTimeLoc}-{2:fdpEndTimeLoc}], duty sector[{3:dutySegmentNum}] exceeds the maximum allowed number of sectors[{4:maxSegmentNum}]";
	msg = StringUtils::Format(msg, duty->getCompositionName(), fdpStartTimeLoc, fdpEndTimeLoc, duty->getNumFlySegs(), maxSegmentNum);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckSegmentRestrictionWOCLForEvaFdRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("compositionName", duty->getCompositionName()));
	rv->operation_result.insert(pair<string, string>("dutySegmentNum", StringUtils::ltos(duty->getNumFlySegs())));
	rv->operation_result.insert(pair<string, string>("maxSegmentNum", maxSegmentNum));
	rv->operation_result.insert(pair<string, string>("fdpStartTimeLoc", fdpStartTimeLoc));
	rv->operation_result.insert(pair<string, string>("fdpEndTimeLoc", fdpEndTimeLoc));
	_ruleViolation.AddRuleViolations(rv);
}
