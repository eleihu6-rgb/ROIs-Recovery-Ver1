/**
 * @file LimitRestTimeBetweenFlightsForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/

#ifndef _LimitRestTimeBetweenFlightsFORSQRULEPARAM_H_
#define _LimitRestTimeBetweenFlightsFORSQRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>

class LimitRestTimeBetweenFlightsForSQRule;

class LimitRestTimeBetweenFlightsForSQRuleParam : public RuleParam {
	friend class LimitRestTimeBetweenFlightsForSQRule;
private:
    explicit LimitRestTimeBetweenFlightsForSQRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7467;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		TYPE = 1,
		FLIGHT_NO_A = 2,
		DEP_ARR_A = 3,
		FLIGHT_NO_B = 4,
		DEP_ARR_B = 5,
		MIN_TIME_LIMIT = 6,
		MAX_TIME_LIMIT = 7,
		PENALTY = 8,
		ACTIVE = 9,
		COMMENT = 10,
		SEVERITY = 11
    };

	//航班前后和强制连接的类型。取值：BEFORE - 航班前、AFTER - 航班后、CONN-二个航班之间
	std::string _type{};

	//Flight A的航班号(不包括航司代码)。
	std::string _flightNumberA{};

	//Flight A的起飞和落地机场。
	std::string _flightDepArrA{};

	//Flight B的航班号(不包括航司代码)。
	std::string _flightNumberB{};

	//Flight B的起飞和落地机场。
	std::string _flightDepArrB{};

	//最小时间限制。格式：HH:MM，支持*
	std::string _minTimeLimit{};
	int _minTimeLimitMinutes{};

	//最大时间限制。格式：HH:MM，支持*
	std::string _maxTimeLimit{};
	int _maxTimeLimitMinutes{};

	//罚分。
	int _penalty{};

	//本条规则是否激活。取值：Y/N。Y-本条规则生效，N-忽略本条规则
	bool _active{true};

	//备注信息。
	std::string _comment{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	//匹配是否满足参数
	bool MatchParam(const Segment* currSegment, const Segment* nextSegment) const;

};

#endif //_LimitRestTimeBetweenFlightsFORSQRULEPARAM_H_
