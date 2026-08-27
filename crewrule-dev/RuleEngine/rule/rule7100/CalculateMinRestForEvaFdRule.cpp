/**
 * @file CalculateMinRestForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMinRestForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestForEvaFdRule::CalculateDuty(Duty* duty) {
	for (const auto & ruleParam : _ruleParams) {
		if (!CalculateDuty(duty, ruleParam)) {
			break;
		}
	}
}

void CalculateMinRestForEvaFdRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMinRestForEvaFdRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

bool CalculateMinRestForEvaFdRule::CalculateDuty(Duty *duty, const CalculateMinRestForEvaFdRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchRule(*duty)) {

		int minRest = GetDutyMinRest(duty, ruleParam);
		duty->setMinRest(minRest);
		duty->setMinRestAtBase(minRest);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());

		next = false;
	}
	return next;
}

void CalculateMinRestForEvaFdRule::CalculateDuty(vector<Duty*> duties) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (Duty* duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, ruleParam)) {
				break;
			}
		}
	}
}

int CalculateMinRestForEvaFdRule::GetDutyMinRest(const Duty* duty, const CalculateMinRestForEvaFdRuleParam& ruleParam) const {
	int minRest = 0;
	if (ruleParam._incrementOfFDPMinutes == nullptr) {
		minRest = ruleParam._basedMinRestMinutes;
	}
	else {
		int minRestBasedFDPMinutes = GetFDPMinutesForMRT(duty) + *(ruleParam._incrementOfFDPMinutes);
		int minRestBased = ruleParam._basedMinRestMinutes;
		minRest = std::max(minRestBasedFDPMinutes, minRestBased);
	}
	return minRest;
}

int CalculateMinRestForEvaFdRule::GetFDPMinutesForMRT(const Duty* duty) const {
	int fdpMinutes = duty->getFDPInSecs() / 60;
	if (_dbData->scenario.airline == "BR") {
		//针对EVAFD特殊处理
		if (fdpMinutes == 0 || _dbData->isAssignmentInGroup(duty->getAssignment(), "MVP")) { //纯DHD的Duty的Assignment为MVP
			fdpMinutes = duty->getDPInSecs() / 60;
		}
		else {
			auto lastSegment = duty->getLastSegment();
			if (_dbData->isAssignmentInGroup(lastSegment->getAssignment(), "DHD")) {
				int delta = static_cast<int>(lastSegment->getEndTimeUtcAct() - duty->getFDPEndUtcTimes("ACT"));
				fdpMinutes += delta / 60;
			}
		}
	}
	return fdpMinutes;
}

void CalculateMinRestForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMinRestForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}