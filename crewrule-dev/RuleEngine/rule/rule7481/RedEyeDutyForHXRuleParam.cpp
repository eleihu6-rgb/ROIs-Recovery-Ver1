/**
 * @file RedEyeDutyForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "RedEyeDutyForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "TimezoneUtils.h"
#include "../constant/Constants.h"

using namespace std;

void RedEyeDutyForHXRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void RedEyeDutyForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_redEyeDefinitionForHXParam->ParseParam(dbRule);
	}
	else {
		_redEyeDefinitionInDutyCycleForHXParams.emplace_back(RedEyeDefinitionInDutyCycleForHXParam(this->GetRule()));
		auto& newParam = _redEyeDefinitionInDutyCycleForHXParams.back();
		newParam.ParseParam(dbRule);
	}
}


