/**
 * @file CheckMinConnectInDutyRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMINCONNECTINDUTYRULEPARAMPARAM_H_
#define _CHECKMINCONNECTINDUTYRULEPARAMPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMinConnectInDutyRule;

class CheckMinConnectInDutyRuleParam : public RuleParam {
	friend class CheckMinConnectInDutyRule;
private:
	explicit CheckMinConnectInDutyRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7273;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		AIRPORT = 1,
		INBOUND_ASSIGNMENTS = 2,
		INBOUND_FLIGHT_FLEETS = 3,
		INBOUND_FLIGHT_DIR = 4,
		INBOUND_SUB_FLEETS = 5,
		OUTBOUND_ASSIGNMENTS = 6,
		OUTBOUND_FLIGHT_FLEETS = 7,
		OUTBOUND_FLIGHT_DIR = 8,
		OUTBOUND_SUB_FLEETS = 9,
		IS_AIRCRAFT_CHANGE = 10,
		MCT = 11,
		TYPE = 12,
		MAX_CONN = 13
	};

	//机场，支持*，支持多选，|分隔
	std::vector<std::string> _airports{};
	//前一段航班的任务类型，支持*，支持多选，|分隔
	std::vector<std::string> _inboundAssignments{};
	//前一段航班的机型，支持*，支持多选，|分隔
	std::vector<std::string> _inboundFlightFleets{};
	//前一段航班的航班类型，支持*，支持多选，|分隔
	std::vector<std::string> _inboundFlightDIR{};
	//前一段航班的子机型，支持*，支持多选，|分隔
	std::vector<std::string> _inboundSubFleets{};
	//后一段航班的任务类型，支持*，支持多选，|分隔
	std::vector<std::string> _outboundAssignments{};
	//后一段航班的机型，支持*，支持多选，|分隔
	std::vector<std::string> _outboundFlightFleets{};
	//后一段航班的航班类型，支持*，支持多选，|分隔
	std::vector<std::string> _outboundFlightDIR{};
	//后一段航班的子机型，支持*，支持多选，|分隔
	std::vector<std::string> _outboundSubFleets{};
	//是否换机, Y/N，支持*
	std::string _isAircraftChange{};
	//最小间隔时间，HH:MM -> minutes
	int _mct{};
	//检查类型 PAIRING/DUTY，PAIRING是指PAIRING内航段间隔，DUTY是指DUTY内航段衔接
	std::string _type{};
	//最大间隔时间，HH:MM -> minutes
 	int _maxConn{};


	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchInboundFlight(const Segment* segment) const ;

	bool MatchOutboundFlight(const Segment* segment) const ;

	bool MatchAircraftChange(const Segment* segment1, const Segment* segment2) const;

	bool CheckConnTime(const int conn) const;
};

#endif //_CHECKMINCONNECTINDUTYRULEPARAMPARAM_H_
