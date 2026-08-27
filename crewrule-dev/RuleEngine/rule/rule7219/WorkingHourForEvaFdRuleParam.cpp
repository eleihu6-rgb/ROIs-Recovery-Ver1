/**
 * @file WorkingHourForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "WorkingHourForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void WorkingHourForEvaFdRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void WorkingHourForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);

	if (dbRule.tableNum == 1) {
		_pairingWorkingHourParams.emplace_back(PairingWorkingHourForEvaFdRuleParam(this->GetRule()));
		auto& newParam = _pairingWorkingHourParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_groundRosterWorkingHourParams.emplace_back(GroundRosterWorkingHourForEvaFdRuleParam(this->GetRule()));
		auto& newParam = _groundRosterWorkingHourParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool WorkingHourForEvaFdRuleParam::Empty() const {
	return _pairingWorkingHourParams.empty()
		&& _groundRosterWorkingHourParams.empty();

}