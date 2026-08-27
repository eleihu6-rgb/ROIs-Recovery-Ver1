/**
 * @file CalculateMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMinRestForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateMinRestForHXRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void CalculateMinRestForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 0 || dbRule.tableNum == 1) {
		_standardMinRestForHXRuleParams.emplace_back(StandardMinRestForHXRuleParam(this->GetRule()));
		auto& newParam = _standardMinRestForHXRuleParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_adjustMinRestForHXRuleParams.emplace_back(AdjustMinRestForHXRuleParam(this->GetRule()));
		auto& newParam = _adjustMinRestForHXRuleParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CalculateMinRestForHXRuleParam::Empty() const {
	return _standardMinRestForHXRuleParams.empty()
		&& _adjustMinRestForHXRuleParams.empty();

}
