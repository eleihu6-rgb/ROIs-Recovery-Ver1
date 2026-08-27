/**
 * @file CheckMinNumberOfDaysOffForPRRuleParam.cpp
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
#include "CheckMinNumberOfDaysOffForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CheckMinNumberOfDaysOffForPRRuleParam::ParseParam(const std::string& paramString) {
	assert(false);
}

void CheckMinNumberOfDaysOffForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_firstCaseParams.emplace_back(CheckMinNumberOfDaysOffBasicForPRRuleParam(this->GetRule()));
		auto& newParam = _firstCaseParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_secondCaseParams.emplace_back(CheckMinNumberOfDaysOffPatternForPRRuleParam(this->GetRule()));
		auto& newParam = _secondCaseParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CheckMinNumberOfDaysOffForPRRuleParam::Empty() const {
	return _firstCaseParams.empty()
		&& _secondCaseParams.empty();

}

void CheckMinNumberOfDaysOffForPRRuleParam::GetPatternList(std::vector<std::vector<unsigned char>>& result, std::vector<std::string> paramList) const {
	
	result.clear();
	for (const auto& strPattern : paramList) {
		vector<string> rdoPattern;
		split(strPattern.c_str(), '+', rdoPattern);
		vector<unsigned char> rdoChar;
		unsigned char curNumRDONeeded{ 0 };
		rdoChar.reserve(rdoPattern.size());
		for (const auto& strRDO : rdoPattern) {
			rdoChar.emplace_back(stoi(strRDO));
		}
//		std::stable_sort(rdoChar.begin(), rdoChar.end());
		result.emplace_back(rdoChar);
	}
}