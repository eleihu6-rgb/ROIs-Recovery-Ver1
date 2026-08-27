/**
 * @file CheckMaxFlightsInPeriodForPRRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMAXFLIGHTSINPERIODFORPRRULEPARAM_H_
#define _CHECKMAXFLIGHTSINPERIODFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxFlightsInPeriodForPRRule;

class CheckMaxFlightsInPeriodForPRRuleParam : public RuleParam {
	friend class CheckMaxFlightsInPeriodForPRRule;
private:
	explicit CheckMaxFlightsInPeriodForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7312;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		FLIGHT_ASSIGNMENTS = 1,
		PERIOD = 2,
		UNIT = 3,
		TYPE = 4,
		MAX_FLIGHTS = 5
	};

	std::vector<std::string> _flightAssignments{};

	int _period{};

	std::string _unit{};

	std::string _type{};

	int _maxFlights{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchAssignment(const string& assignment) const;
};

#endif //_CHECKMAXFLIGHTSINPERIODFORPRRULEPARAM_H_
