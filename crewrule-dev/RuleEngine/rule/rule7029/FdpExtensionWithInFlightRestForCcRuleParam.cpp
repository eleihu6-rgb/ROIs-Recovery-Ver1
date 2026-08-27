/**
 * @file FdpExtensionWithInFlightRestForCcRuleParam.cpp
 * @brief 7029法规主参数类实现
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#include <cassert>
#include "FdpExtensionWithInFlightRestForCcRuleParam.h"
#include "Log/Logger.h"

void FdpExtensionWithInFlightRestForCcRuleParam::ParseParam(const std::string& paramString) {
	assert(false);
}

void FdpExtensionWithInFlightRestForCcRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);

	if (dbRule.tableNum == 1) {
		_fdpExtensionConfigParam.emplace_back(FdpExtensionWithInFlightRestForCcConfigParam(this->GetRule()));
		auto& newParam = _fdpExtensionConfigParam.back();
		newParam.ParseParam(dbRule);
	} else {
		_flightOperTimeConfigParam.emplace_back(FlightOperationTimeForCcConfigParam(this->GetRule()));
		auto& newParam = _flightOperTimeConfigParam.back();
		newParam.ParseParam(dbRule);
	}
}

bool FdpExtensionWithInFlightRestForCcRuleParam::Empty() const {
	return _fdpExtensionConfigParam.empty() && _flightOperTimeConfigParam.empty();
}
