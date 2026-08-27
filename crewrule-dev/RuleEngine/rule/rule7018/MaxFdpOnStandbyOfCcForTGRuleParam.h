/**
 * @file MaxFdpOnStandbyOfCcForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MAXFDPONSTANDBYOFCCFORTGRULEPARAM_H_
#define _MAXFDPONSTANDBYOFCCFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TimeRangeMatchExpression.h"
#include "matcher/BoolMatchExpression.h"
#include <string>
#include <limits>


class CalculateMaxFdpOnStandbyOfCcForTGRule;

class MaxFdpOnStandbyOfCcForTGRuleParam : public RuleParam {
	friend class CalculateMaxFdpOnStandbyOfCcForTGRule;
private:
    explicit MaxFdpOnStandbyOfCcForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7018;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 13;

    enum class ParamLocation {
		IS_HOME_BASE = 1,
		STANDBY_ASSIGNMENT_GROUPS = 2,
		STANDBY_ASSIGNMENTS = 3,
		STANDBY_START_TIME_RANGES = 4,
		INCLUDING_SPLIT_DUTY = 5,
		SEGMENT_ASSIGNMENTS = 6,
		REST_FACILTY = 7,
		DUTY_REST_RANGE_IN_FLIGHT = 8,
		FT_OFFSET_PER_SEGMENT = 9,
		FT_DISCOUNT_DIVISOR = 10,
		STANDBY_DURATION_AFTER_HHMM = 11,
		GAP_OF_STANDBY_DURATION = 12,
		SEVERITY = 13
    };

	//是否在基地,取值：Y/N。*表示未设置
	std::unique_ptr<bool> _isHomeBase{ nullptr };

	//Standby的任务类型组,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _standbyAssignmentGroupsMatch;

	//Standby的任务类型,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignments{};
	AssignmentMatchExpression<Activity> _standbyAssignmentsMatch;

	//Standby开始时间段。格式：HH:mm-HH:mm取值范围:[HH:mm,HH:mm)
	std::string _standbyStartTimeRanges{};
	int _standbyStartTimeHHmmLower{};
	int _standbyStartTimeHHmmUpper{};

	//Standby后续执行Duty是否可以是包含Split Duty。取值：Y - 包含（是），N-不包含（否）。若设置为*，则忽略Split Duty相关配置。
	std::string _isIncludingSplitDuty{};
	BoolMatchExpression _isIncludingSplitDutyMatch;

	//Segment任务类型，支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::string _segmentAssignments{};
	AssignmentMatchExpression<Activity> _segmentAssignmentsMatch;

	//航班机上休息设施。取值：S-Sleep睡眠设施、R-Rest休息设施.
	std::string _restFacilty{};

	//Duty的机上休息时长范围。格式：HH:mm-HH:mm取值范围:[HH:mm,HH:mm)。若设置为*，则忽略机上休息相关配置
	std::string _dutyRestRangeInFlight{};
	TimeRangeMatchExpression _dutyRestRangeInFlightMatch;

	//机上休息航段飞时扣除值。格式：HH:mm。若设置为*，则忽略该参数
	std::string _ftOffsetPerSegment{};
	int _ftOffsetPerSegmentMinutes{};

	//机上休息航段飞时折扣除数。若设置为*，则忽略该参数
	int _ftDiscountDivisor{};

	//X点之后 standby 时长。格式：HH:mm。若设置为*，则忽略该参数
	std::string _standbyDurationAfterHHmm{};
	int _standbyDurationAfterHHmmMinutes{};

	//抓飞时长的Gap。格式：HH:mm
	std::string _gapOfStandbyDuration{};
	int _gapOfStandbyDurationMinutes{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配是否满足在基地条件
	bool MatchHomeBase(const Duty& duty, const std::string& base) const;

	//匹配Standby开始时间段
	bool MatchStandbyStartTimeRanges(const ROSTER* standbyRoster) const;

	//匹配机上休息设施
	bool MatchRestFacilty(const Segment& segment) const;

	//匹配Duty的机上休息时长
	bool MatchDutyRestRangeInFlight(const Duty& duty) const;


public:

	bool ignoreStandbyDurationAfterHHmm() const;

	//匹配是否满足参数
	bool MatchParam(const ROSTER* standbyRoster, const Duty& duty, const string& base) const;

};

#endif //_MAXFDPONSTANDBYOFCCFORTGRULEPARAM_H_
