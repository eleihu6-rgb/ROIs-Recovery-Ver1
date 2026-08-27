/**
 * @file CalculateMinRestByDutyPeriodForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/

#include "../RuleSytem.h"
#include "CalculateMinRestByDutyPeriodForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestByDutyPeriodForTGRule::CalculateDuty(Duty* duty) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duty->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (const auto & ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}
		if (!CalculateDuty(duty, nullptr, base, ruleParam)) {
			break;
		}
	}
}

void CalculateMinRestByDutyPeriodForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = pairing->getFirstDuty()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	CalculateDuty(pairing->getDutyVec(), nullptr, base);
}

void CalculateMinRestByDutyPeriodForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	for (auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			auto& duties = roster->pairing->getDutyVec();
			CalculateDuty(duties, roster, base);
		}
	}
}

void CalculateMinRestByDutyPeriodForTGRule::CalculateDuty(vector<Duty*> duties, const ROSTER* roster, const string& base) {
	for (Duty* duty : duties) {
		for (const auto& ruleParam : _ruleParams) {

			if (roster != nullptr && roster->isMergeDpWithNext) {
				//特殊处理 roster->isMergeDpWithNext==true，表示当前Roster的最后一个Duty的DP被合并到下一个Roster的第一个Duty上.最后一个Duty的MinRest强制设置为0
				if (roster->pairing != nullptr && duty != nullptr && roster->pairing->getLastDuty()->getDutySeq() == duty->getDutySeq()) {
					duty->setMinRest(0, true);
					duty->setMinRestAtBase(0, true);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, 0, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
					break;
				}
			}

			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			if (!CalculateDuty(duty, roster, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMinRestByDutyPeriodForTGRule::CalculateDuty(Duty *duty, const ROSTER* roster, const string& base, const CalculateMinRestByDutyPeriodForTGRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*duty, roster, base)) {
		int newMinRest = ruleParam.GetMultipliedValue(*duty, roster);

		// Min Rest = MAX(Base Rest, Rest Multiplied * Multiplied Type)
		int minRest = std::max(ruleParam._minRestMinutes, newMinRest);

		duty->setMinRest(minRest);
		if (ruleParam._isHomeBase != nullptr && *ruleParam._isHomeBase) {
			duty->setMinRestAtBase(minRest);
		}
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());

		next = false;
	}
	return next;
}

void CalculateMinRestByDutyPeriodForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestByDutyPeriodForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMinRestByDutyPeriodForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}