/**
 * @file CalculateMinRestByBlockTimeForPRRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMinRestByBlockTimeForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

void CalculateMinRestByBlockTimeForPRRule::CalculateDuty(Duty* duty) {
	for (const auto& ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (!CalculateDuty(duty, nullptr, map<long long, vector<std::shared_ptr<TmCourse>>>(), ruleParam)) {
			break;
		}
	}
}

void CalculateMinRestByBlockTimeForPRRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec(), nullptr, map<long long, vector<std::shared_ptr<TmCourse>>>());
}

void CalculateMinRestByBlockTimeForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
    auto flightCourseMap = TrainingCourseUtils::GetFlightCourseMap(crew, this->_dbData);

	for (auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			auto& duties = roster->pairing->getDutyVec();
			CalculateDuty(duties, roster, flightCourseMap);
		}
	}
}

bool CalculateMinRestByBlockTimeForPRRule::CalculateDuty(Duty* duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchRule(*duty, roster, flightCourseMap) && ruleParam.MatchDutyAttributes(*duty)) {
		int actualBLH = DutyUtils::GetDutyActualBLH(duty, roster);
		int minRest = ruleParam.GetMinRest(actualBLH);
		bool locked = ruleParam._isOverrideable == nullptr ? false : *(ruleParam._isOverrideable.get());
		
		// 如果设置了duty attribute，则覆盖原有的最小休息时间
		if (!ruleParam._overrideDutyAttributes.empty() && ruleParam._overrideDutyAttributes != "*")
			locked = true;
		
		bool success = duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), locked, locked, false);
		if (success) {
			duty->setMinRest(minRest, true);
			duty->setMinRestAtBase(minRest, true);
			next = false;
		}
	}
	return next;
}

void CalculateMinRestByBlockTimeForPRRule::CalculateDuty(vector<Duty*> duties, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) {
	
	for (Duty* duty : duties) {
		bool next = true;
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

			if (ruleParam.GetClassType() == RuleClassType::RO) {
				continue;
			}
			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}
			next = CalculateDuty(duty, roster, flightCourseMap, ruleParam);
			if (!next) {
				break;
			}
		}
	}
}



void CalculateMinRestByBlockTimeForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestByBlockTimeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
