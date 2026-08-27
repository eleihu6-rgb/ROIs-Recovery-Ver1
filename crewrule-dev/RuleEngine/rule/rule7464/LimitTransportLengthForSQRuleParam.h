/**
 * @file LimitTransportLengthForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/

#ifndef _LIMITTRANSPORTLENGTHFORSQRULEPARAM_H_
#define _LIMITTRANSPORTLENGTHFORSQRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>

class LimitTransportLengthForSQRule;

class LimitTransportLengthForSQRuleParam : public RuleParam {
	friend class LimitTransportLengthForSQRule;
private:
    explicit LimitTransportLengthForSQRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7464;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		SERVICE_TYPE = 1,
		FLEET_GROUP = 2,
		FLIGHT_FLAGS = 3,
		FLIGHT_ASSIGNMENTS = 4,
		EXCEPTION_FLIGHT_ROUTES = 5,
		MAX_TRANSPORT_LENGTH = 6,
		SEVERITY = 7
    };

	//服务类型列表。多个值使用“|”分隔并支持*通配
	vector<string> _serviceTypes{};

	//机队组列表。多个值使用“|”分隔并支持*通配
	vector<string> _fleetGroups{};

	//航班标识列表。多个值使用“|”分隔并支持*通配
	vector<string> _flightFlags{};

	//航班的assignment列表。多个值使用“|”分隔并支持*通配
	vector<string> _flightAssignments{};

	//例外交通路线列表。格式：出发地点机场-到达地点机场（机场使用三字码），多个值使用|分割，支持*忽略该参数。
	vector<string> _exceptionFlightRoutes{};

	//最大交通时长（分钟数）。格式：HH:mm
	std::string _maxTransportLength{};
	int _maxTransportLengthMinutes{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchFlightFlags(const Segment* segment) const;

	bool MatchFlightAssignments(const Segment* segment) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Segment* segment) const;

	//是否例外的交通路线
bool IsAllowedFlightRoute(const Segment* segment) const;

	//匹配Duty级过滤条件
	bool MatchDuty(const Duty* duty) const;

};

#endif //_LIMITTRANSPORTLENGTHFORSQRULEPARAM_H_
