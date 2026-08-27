/**
 * @file ReduceOffDutyPeriodAwayFromBaseRuleParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "ReduceOffDutyPeriodAwayFromBaseRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void ReduceOffDutyPeriodAwayFromBaseRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void ReduceOffDutyPeriodAwayFromBaseRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_firstCaseParams.emplace_back(ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam(this->GetRule()));
		auto& newParam = _firstCaseParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_secondCaseParams.emplace_back(ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam(this->GetRule()));
		auto& newParam = _secondCaseParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool ReduceOffDutyPeriodAwayFromBaseRuleParam::Empty() const {
	return _firstCaseParams.empty()
		&& _secondCaseParams.empty();

}