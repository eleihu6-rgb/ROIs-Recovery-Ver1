/**
 * @file TransitAndLayoverRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <algorithm>
#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "TransitAndLayoverRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

using namespace std;

void TransitAndLayoverRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void TransitAndLayoverRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_limitLayoverParams.emplace_back(LimitLayoverParam(this->GetRule()));
		auto& newParam = _limitLayoverParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_limitAircraftChangeAndConnectionParams.emplace_back(LimitAircraftChangeAndConnectionParam(this->GetRule()));
		auto& newParam = _limitAircraftChangeAndConnectionParams.back();
		newParam.ParseParam(dbRule);
		PushCheckGroup(newParam);
	}
}

bool TransitAndLayoverRuleParam::Empty() const {
	return _limitLayoverParams.empty() 
		&& _limitAircraftChangeAndConnectionParams.empty();

}

vector<LimitAircraftChangeAndConnectionParam> TransitAndLayoverRuleParam::GetLimitAircraftChangeAndConnectionParams(const vector<std::string>& checkGroups) {
	vector<LimitAircraftChangeAndConnectionParam> result;
	for (auto& group : checkGroups) {
		auto range = _mapLimitAircraftChangeAndConnectionParam.equal_range(group);
		for (auto it = range.first; it != range.second; ++it) {
			result.push_back(it->second);
		}
	}
	return result;
}

void TransitAndLayoverRuleParam::PushCheckGroup(const LimitAircraftChangeAndConnectionParam &param) {
	for (auto& group : param._checkGroups) {
		_mapLimitAircraftChangeAndConnectionParam.insert(pair<string, LimitAircraftChangeAndConnectionParam>(group, param));
	}
}

