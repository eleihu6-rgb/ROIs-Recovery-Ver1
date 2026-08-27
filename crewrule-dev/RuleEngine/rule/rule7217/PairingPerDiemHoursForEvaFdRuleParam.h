/**
 * @file PairingPerDiemHoursForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _PAIRINGPERDIEMHOURSFOREVAFDRULEPARAM_H_
#define _PAIRINGPERDIEMHOURSFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

#include <string>
#include <limits>

class CalculatePairingPerDiemHoursForEvaFdRule;


class PairingPerDiemHoursForEvaFdRuleParam : public RuleParam {
friend class CalculatePairingPerDiemHoursForEvaFdRule;
private:
    explicit PairingPerDiemHoursForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7217;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		PAIRING_ASSIGNMENT_GROUPS = 0,
		DUTY_ASSIGNMENTS = 1,
		NUMBER_RANGE_OF_SEGMENT_IN_DUTY = 2,
		PER_DIEM = 3,
		PER_DIEM_GAP = 4,
		DELAY_BUFFER = 5,
		SEVERITY = 6
    };

	//Pairing的任务组,多个值使用“|”分隔并支持*通配
	std::string _pairingAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _pairingAssignmentGroupsMatch;

	//Duty的任务类型,多个值使用“|”分隔并支持*通配
	std::string _dutyAssignments{};
	AssignmentMatchExpression<Activity> _dutyAssignmentsMatch;

	//Duty的Segment数量范围。格式：n-m，表示[n,m]左闭右闭。*通配表示忽略该参数
	std::string _numRangeOfSegment{};
	NumericRangeMatchExpression _numRangeOfSegmentMatch;

	//Per Diem Hour计算公式,取值：D-B表示Pairing的Debrief时间减去Brief时间，或者具体时长（格式HH:mm）
	std::string _perDiemExpression{};
	std::shared_ptr<int> _perDiemExpressionMinutes{ nullptr };

	//Per Diem Hour偏差值,格式：HH:mm。可能负数
	std::string _perDiemGap{};
	int _perDiemGapMinutes{};

	//PerDiem时间航班延误阈值(默认：30分钟),格式：HH:mm
	std::string _perDiemDelayBuffer{ "00:30" };
	int _perDiemDelayBufferMinutes{ 30 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	//匹配参数
	bool MatchParam(const Pairing* pairing, const Duty* duty) const;

};

#endif //_PAIRINGPERDIEMHOURSFOREVAFDRULEPARAM_H_
