/**
 * @file FdpExtensionWithInFlightRestForCcRuleParam.h
 * @brief 7029法规主参数类 - TG FDP Extension with in-flight rest for Cabin Crew
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#ifndef _FDPEXTENSIONWITHINFLIGHTRESTFORCCRULEPARAM_H_
#define _FDPEXTENSIONWITHINFLIGHTRESTFORCCRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "FdpExtensionWithInFlightRestForCcConfigParam.h"
#include "FlightOperationTimeForCcConfigParam.h"

#include <vector>

class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;

/**
 * 主参数类
 */
class FdpExtensionWithInFlightRestForCcRuleParam : public RuleParam {
	friend class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
private:
	explicit FdpExtensionWithInFlightRestForCcRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7029;

	mutable std::vector<FdpExtensionWithInFlightRestForCcConfigParam> _fdpExtensionConfigParam;
	mutable std::vector<FlightOperationTimeForCcConfigParam> _flightOperTimeConfigParam;

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

public:
	std::vector<FdpExtensionWithInFlightRestForCcConfigParam>& GetFdpExtensionConfigParam() const {
		return _fdpExtensionConfigParam;
	}

	std::vector<FlightOperationTimeForCcConfigParam>& GetFlightOperTimeConfigParam() const {
		return _flightOperTimeConfigParam;
	}

	bool Empty() const;
};

#endif //_FDPEXTENSIONWITHINFLIGHTRESTFORCCRULEPARAM_H_
