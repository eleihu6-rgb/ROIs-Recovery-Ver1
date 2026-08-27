/**
 * @file FlightOperationTimeForCcConfigParam.h
 * @brief 7029法规 Table2 参数类 - 配置航班的起飞、落地和服务时间
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#ifndef _FLIGHTOPERATIONTIMEFORCCCONFIGPARAM_H_
#define _FLIGHTOPERATIONTIMEFORCCCONFIGPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"

#include <string>
#include <limits>
#include <vector>

class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
class FdpExtensionWithInFlightRestForCcRuleParam;

/**
 * Table2参数：配置航班的起飞、落地和服务时间
 */
class FlightOperationTimeForCcConfigParam : public RuleParam {
	friend class CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
	friend class FdpExtensionWithInFlightRestForCcRuleParam;
private:
	explicit FlightOperationTimeForCcConfigParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7029;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 5;

	enum class ParamLocation {
		FLIGHT_NUMBERS = 0,
		FLEETS = 1,
		TAKE_OFF_TIME = 2,
		LANDING_TIME = 3,
		SERVICE_TIME = 4
	};

	//Flight Numbers。多个使用|分割，支持*
	std::string _flightNumbers{};
	std::vector<std::string> _flightNumberList{};

	//Fleets。多个使用|分割，支持*
	std::string _fleets{};
	std::vector<std::string> _fleetList{};

	//Take Off Time。格式：hh:mm
	std::string _takeOffTime{};
	int _takeOffTimeMinutes{0};

	//Landing Time。格式：hh:mm
	std::string _landingTime{};
	int _landingTimeMinutes{0};

	//Service Time。格式：hh:mm
	std::string _serviceTime{};
	int _serviceTimeMinutes{0};

	void ParseParam(const std::string& paramString);
	void ParseParam(const DBRule& dbRule);

private:
	//匹配Flight Numbers
	bool MatchFlightNumber(const std::string& flightNumber) const;

	//匹配Fleets
	bool MatchFleet(const std::string& fleet) const;

public:
	int GetTakeOffTimeMinutes() const { return _takeOffTimeMinutes; }
	int GetLandingTimeMinutes() const { return _landingTimeMinutes; }
	int GetServiceTimeMinutes() const { return _serviceTimeMinutes; }

	bool MatchParam(const Segment* segment) const;
};

#endif //_FLIGHTOPERATIONTIMEFORCCCONFIGPARAM_H_
