/**
 * @file CalculateMaxFdpExtensionOfCcForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEMAXFDPEXTENSIONOFCCFORTGRULEPARAM_H_
#define _CALCULATEMAXFDPEXTENSIONOFCCFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/TimeRangeMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CalculateMaxFdpExtensionOfCcForTGRule;

class CalculateMaxFdpExtensionOfCcForTGRuleParam : public RuleParam {
	friend class CalculateMaxFdpExtensionOfCcForTGRule;
private:
    explicit CalculateMaxFdpExtensionOfCcForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7017;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		SEGMENT_ASSIGNMENTS = 0,
		DUTY_BY_FLIGHT_NUMBERS = 1,
		DUTY_REST_RANGE_IN_FLIGHT = 2,
		REST_FACILTY = 3,
		FT_OFFSET_PER_SEGMENT = 4,
		FT_DISCOUNT_DIVISOR = 5,
		MAX_FDP = 6,
		SEVERITY = 7
    };

	//Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::string _segmentAssignments{};
	AssignmentMatchExpression<Activity> _segmentAssignmentsMatch;

	//组成Duty的航班列表，格式：FltNumA1-FltNumA1-FltNumA2|FltNumB1-FltNumB1-FltNumB2，例如：315-316|335-336|351-352
	std::string _strDutyByFlightNumbers;
	vector<vector<string>> _dutyByFlightNumbers;

	//Duty的机上休息时间范围。格式：HH:mm-HH:mm
	std::string _dutyRestRangeInFlight{};
	TimeRangeMatchExpression _dutyRestRangeInFlightMatch;

	//航班机上休息设施。取值：S-Sleep睡眠设施、R-Rest休息设施.
	std::string _restFacilty{};
	
	//航段飞时扣除值。格式：HH:mm
	std::string _ftOffsetPerSegment{};
	int _ftOffsetPerSegmentMinutes{};
	
	//航段飞时折扣除数。
	int _ftDiscountDivisor{};
	
	//扩展后最大FDP。格式：HH:mm
	std::string _maxFDP{};
	int _maxFDPMinutes{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配Duty的航班号列表
	bool MatchDutyByFlightNumbers(const Duty& duty) const;

	//匹配Duty的机上休息时长
	bool MatchDutyRestRangeInFlight(const Duty& duty) const;

	//匹配机上休息设施
	bool MatchRestFacilty(const Segment& segment) const;

	//匹配FDP，若实际FDP大于Max FDP返回true
	bool MatchMaxFDP(const Duty& duty, const long callinSBY_FDPMins = 0) const;

public:
	bool MatchParam(const Duty& duty) const;

};

#endif //_CALCULATEMAXFDPEXTENSIONOFCCFORTGRULEPARAM_H_
