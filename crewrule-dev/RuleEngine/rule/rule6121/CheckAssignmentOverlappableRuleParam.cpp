/**
 * @file CheckAssignmentOverlappableRuleParam.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "CheckAssignmentOverlappableRuleParam.h"
#include "CrewDB.h"
#include "../utils/AssignmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CheckAssignmentOverlappableRuleParam::ParseParam(const std::string& paramString) {
	assert(false);
}

void CheckAssignmentOverlappableRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_firstCaseParams.emplace_back(CheckAssignmentOverlappableFirstRuleParam(this->GetRule()));
		auto& newParam = _firstCaseParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_secondCaseParams.emplace_back(CheckAssignmentOverlappableSecondRuleParam(this->GetRule()));
		auto& newParam = _secondCaseParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CheckAssignmentOverlappableRuleParam::Empty() const {
	return _firstCaseParams.empty()
		&& _secondCaseParams.empty();

}

bool CheckAssignmentOverlappableRuleParam::MatchAssignmentOverlappable(const string prevAssignment, const string nextAssignment) const {

	return AssignmentUtils::IsAssignmentOverlappable(prevAssignment, nextAssignment, this->GetRule()->GetDataContext());
}

bool CheckAssignmentOverlappableRuleParam::OnlyCheckFirstParam() const {

	if (_firstCaseParams.empty() || _firstCaseParams[0]._onlyCheckOverlappableTable == "*" || _firstCaseParams[0]._onlyCheckOverlappableTable.empty())
		return true;

	return _firstCaseParams[0]._onlyCheckOverlappableTable == "Y";

}
