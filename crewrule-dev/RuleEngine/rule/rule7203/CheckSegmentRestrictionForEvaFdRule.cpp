/**
 * @file SegmentRestrictionForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckSegmentRestrictionForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "RuleParams.h"


bool CheckSegmentRestrictionForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool CheckSegmentRestrictionForEvaFdRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckSegmentRestrictionForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	if (rosters.empty()) {
		return true;
	}

	bool valid = true;
	for (auto roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}

		if (RuleParams::GetInstancePtr()->getApplication() == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}

		if (!CheckRule(roster->pairing->getDutyVec(), roster)) {
			valid = false;
		}
	}
	return valid;
}

bool CheckSegmentRestrictionForEvaFdRule::CheckRule(const vector<Duty*>& duties, const ROSTER* roster) const {
	if (duties.empty()) {
		return true;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		int consecutiveDutyCount = 0;
		for (std::size_t i = 0; i < duties.size(); i++) {
			Duty* duty = duties.at(i);

			if (RosterUtils::ExistExceptionCode(roster, duty, ruleParam.GetExceptionCodes(), _dbData)) {
				consecutiveDutyCount = 0;
				continue;
			}

			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				consecutiveDutyCount = 0;
				continue;
			}
			_ruleViolation.SetRuleParam(ruleParam);
			if (ruleParam.MatchRule(*duty, base)) {
				consecutiveDutyCount++;
				if ((ruleParam._consecutiveDuty.empty() || ruleParam._consecutiveDuty == RuleParamConstant::ALL) 
					|| (consecutiveDutyCount >= ruleParam._consecutiveDutyLower && consecutiveDutyCount <= ruleParam._consecutiveDutyUpper)) {

					bool valid = ruleParam.CheckRule(*duty);
					if (!valid) {
						passAllRule = false;
						ThrowRuleViolation(duty, ruleParam);
						if (!this->IsCheckAllRule()) {
							break;
						}
					}
				}
			} else {
				consecutiveDutyCount = 0;
			}
		}
		if (!passAllRule && !this->IsCheckAllRule()) {
			break;
		}
	
	}
	return passAllRule;
}

void CheckSegmentRestrictionForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(SegmentRestrictionForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(SegmentRestrictionForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckSegmentRestrictionForEvaFdRule::ThrowRuleViolation(const Duty* duty, const SegmentRestrictionForEvaFdRuleParam& ruleParam) const{
	string segNum = _ruleViolation.GetParam("segNum");
	string reportTimeHHmm = TimeUtils::Format(duty->getStartTimeLocAct(), "HH:mm");
	std::string msg = "The number of sectors ({0:segmentNum}) in the duty is more than the maxmum ({1:maxSegmentNum}); Report time: {2:reportTimeHHmm}.";
	msg = StringUtils::Format(msg, segNum, ruleParam._maxSegmentNum, reportTimeHHmm);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckSegmentRestrictionForEvaFdRule::RuleFuncId;
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
	rv->operation_result.insert(pair<string, string>("segNum", segNum));
	rv->operation_result.insert(pair<string, string>("maxSegmentNum", std::to_string(ruleParam._maxSegmentNum)));
	rv->operation_result.insert(pair<string, string>("reportTimeHHmm", reportTimeHHmm));
	_ruleViolation.AddRuleViolations(rv);
}

