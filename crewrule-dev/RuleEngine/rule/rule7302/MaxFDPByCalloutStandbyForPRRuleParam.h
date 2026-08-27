/**
 * @file MaxFDPByCalloutStandbyForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-19
**/

#ifndef _MAXFDPBYCALLOUTSTANDBYFORPRRULEPARAM_H_
#define _MAXFDPBYCALLOUTSTANDBYFORPRRULEPARAM_H_

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


class CalculateMaxFDPByCalloutStandbyForPRRule;

class MaxFDPByCalloutStandbyForPRRuleParam : public RuleParam {
	friend class CalculateMaxFDPByCalloutStandbyForPRRule;
private:
    explicit MaxFDPByCalloutStandbyForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7302;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 12;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		STANDBY_ASSIGNMENT_GROUPS = 5,
		STANDBY_ASSIGNMENTS = 6,
		STANDBY_START_RANGE = 7,
		STANDBY_OVERLAP_RANGE = 8,
		CALLOUT_FDP_TYPE = 9,
		THRESHOLD = 10,
		ADJUSTMENT_PCT = 11,
		SEVERITY = 12
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Standby的任务类型组,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _standbyAssignmentGroupsMatch;

	//Standby的任务类型,多个值使用“|”分隔并支持*通配
	std::string _standbyAssignments{};
	AssignmentMatchExpression<Activity> _standbyAssignmentsMatch;

	//Standby开始的时间区间，local time，格式：HH:mm-HH:mm，支持*忽略
	std::string _standbyStartRange{};
	int _standbyStartRangeLower{};
	int _standbyStartRangeUpper{};

	//Fly与Standby重叠的时间区间，local time，格式：HH:mm-HH:mm，支持*忽略
	std::string _standbyOverlapRange{};
	int _standbyOverlapRangeLower{};
	int _standbyOverlapRangeUpper{};

	//Callout执行的FLY Duty类型：SplitDuty 或 InflightRest，支持*忽略
	std::string _calloutFDPType{};

	//阈值。当Standby时长超过该时间，调整Max FDP。格式：HH:mm
	std::string _thresholdHHmm{};
	int _thresholdHHmmMinutes{};

	//调整百分比例。当Standbyy时长超过Threshold设置的时间，Max fdp调整值 =超过部分 * 该百分比例
	std::string _strAdjustmentPCT{};
	int _adjustmentPCT{100};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
public:

	//匹配是否满足参数
	bool MatchParam(const ROSTER* standbyRoster, const ROSTER* flyRoster, const Duty& duty) const;

	//匹配Standby开始时间是否在指定范围内
	bool MatchStandbyStartTimeRange(const ROSTER* standbyRoster) const;
	
	//匹配Callout FDP类型
	bool MatchCalloutFDPType(const Duty& duty) const;
	
	//计算扣除的Standby时长
	int CalculateStandbyDeduction(const ROSTER* standbyRoster, const ROSTER* flyRoster) const;

};

#endif //_MAXFDPBYCALLOUTSTANDBYFORPRRULEPARAM_H_
