/**
 * @file PairingWorkingHourForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _PAIRINGWORKINGHOURFOREVAFDRULEPARAM_H_
#define _PAIRINGWORKINGHOURFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"
#include "matcher/BoolMatchExpression.h"

#include <string>
#include <limits>

class CalculateWorkingHourInMandayForEvaFdRule;
class WorkingHourForEvaFdRuleParam;

class PairingWorkingHourForEvaFdRuleParam : public RuleParam {
	friend class CalculateWorkingHourInMandayForEvaFdRule;
	friend class WorkingHourForEvaFdRuleParam;
private:
    explicit PairingWorkingHourForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7219;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 20;

	enum class ParamLocation {
		PAIRING_ASSIGNMENTS = 0,
		DUTY_ASSIGNMENTS = 1,
		SEGMENT_ASSIGNMENT_GROUPS = 2,
		SEGMENT_ASSIGNMENTS = 3,
		OTHER_SEGMENT_ASSIGNMENTS_IN_DUTY = 4,
		NUMBER_RANGE_OF_SEGMENT_IN_DUTY = 5,
		ANY_ONE_OF_SEGMENT_IN_DUTY_CROSS_MONTHS = 6,
		SEGMENT_CROSS_MONTHS = 7,
		FOLLOWING_PAIRING = 8,
		COURSE_CODE = 9,
		TRAINING_ROLES = 10,
		COURSE_CODE_IN_DUTY = 11,
		TRAINING_ROLES_IN_DUTY = 12,
		WORKING_HOUR = 13,
		PERCENT = 14,
		MAX_WORKING_HOUR = 15,
		MIN_WORKING_HOUR = 16,
		DUTY_MIN_WORKING_HOUR = 17,
		SPLIT_METHOD = 18,
		SEVERITY = 19
    };

	//Pairing的任务类型。多个值使用“|”分隔并支持*通配
	std::string _pairingAssignments{};
	AssignmentMatchExpression<Activity> _pairingAssignmentsMatch;

	//Duty的任务类型。多个值使用“|”分隔并支持*通配
	std::string _dutyAssignments{};
	AssignmentMatchExpression<Activity> _dutyAssignmentsMatch;

	//Segment的任务组。多个值使用“|”分隔并支持*通配
	std::string _segmentAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _segmentAssignmentGroupsMatch;

	//Segment的任务类型。多个值使用“|”分隔并支持*通配
	std::string _segmentAssignments{};
	AssignmentMatchExpression<Activity> _segmentAssignmentsMatch;

	//Duty中其他Segment的任务类型。格式：A|B|C 或 *,使用“|”分隔多个值，*通配表示忽略该参数
	std::string _otherSegmentAssignments{};
	AssignmentMatchExpression<Activity> _otherSegmentAssignmentsMatch;

	//Duty的Segment数量范围。格式：n-m，表示[n,m]左闭右闭。*通配表示忽略该参数
	std::string _numRangeOfSegment{};
	NumericRangeMatchExpression _numRangeOfSegmentMatch;

	//Duty中任何一个Segment跨月(Segment Assignment要求在Segment Assignments中)。格式：Y/N。*通配表示忽略该参数
	std::string _isAnySegmentCrossMonths{};
	BoolMatchExpression _isAnySegmentCrossMonthsMatch;

	//当前Segment是否跨月。格式：Y/N，*通配表示忽略该参数
	std::string _isSegmentCrossMonths{};
	BoolMatchExpression _isSegmentCrossMonthsMatch;

	//是否紧接Pairing(包含重叠)。格式：Y/N，*通配表示忽略该参数。当前Pairing后面是否紧接Pairing(包含重叠)
	std::string _isFollowingPairing{};
	BoolMatchExpression _isFollowingPairingMatch;

	//课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;

	//训练角色。多个值使用“|”分隔并支持*通配
	std::string _trainingRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRolesMatch;

	//Duty中任何一个Segment课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodesInDuty{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeInDutyMatch;

	//Duty中任何一个Segment训练角色。多个值使用“|”分隔并支持*通配
	std::string _trainingRolesInDuty{};
	TrainingRoleMatchExpression<Activity> _trainingRolesInDutyMatch;

	//工作时间计算表达式。公式或者具体时长（格式HH:mm），支持公式如下：BT：飞时，ACC：飞时合计，AVG：飞时平均值，D-B：Duty签到到签出
	std::string _whExpression{};
	std::shared_ptr<int> _whExpressionMinutes{nullptr};

	//工作时间折算比例。取值：D-B表示Pairing的Debrief时间减去Brief时间，*通配表示忽略该参数
	std::shared_ptr<double> _whPercent{nullptr};

	//Segment或地面任务的最大工作时间(分钟)。格式：HH:mm。*通配表示忽略该参数
	//string _whMax;
	std::shared_ptr<int> _whMaxMinutes{ nullptr };

	//Segment或地面任务的最小工作时间(分钟)。格式：HH:mm。*通配表示忽略该参数
	//string _whMin;
	std::shared_ptr<int> _whMinMinutes{ nullptr };

	//Duty的最小工作时间(分钟)。格式：HH:mm。*通配表示忽略该参数
	//string _whMin;
	std::shared_ptr<int> _whMinDutyMinutes{ nullptr };

	//跨天分隔时长方式。取值：SPAN -按实际的时间跨度进行切分，AVG - 按平均切割
	string _splitMethod{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断其他Segment Assignment是否满足条件
	bool MatchOtherSegmentAssignments(const Duty* duty, const Segment* segment) const;

	//判断Duty中特定Segment是否跨月，即Duty中特定Segment是否跨月（Layover、中转等休息跨月，不认为Duty跨月）
	//特定Segment：满足_segmentAssignments 和 _segmentAssignmentGroups 条件
	bool MatchCrossMonths(const BoolMatchExpression& boolMatchExpression, const Duty* duty, const int offsetTZMinutes) const;

	//判断Segment跨月
	bool MatchCrossMonths(const BoolMatchExpression& boolMatchExpression, const Segment* segment, const int offsetTZMinutes) const;

	//判断是否紧接或重叠
	bool MatchFollowingPairing(const ROSTER* currRoster, const ROSTER* nextRoster) const;
	bool MatchFollowingSegment(const Segment* currSegment, const Segment* nextSegment) const;

	//判断Duty中某个Segment是否同时满足Course Code和Training Roles
	bool MatchCourseCodesAndTrainingRolesInDuty(const ROSTER* currRoster, const Duty* duty) const;
public:

	//匹配参数
	bool MatchParam(const Pairing* pairing, const Duty* duty, const Segment* currSegment, const Segment* nextSegment, const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes) const;

	//匹配参数
	bool MatchParam(const Segment* segment, const ROSTER* roster) const;


};

#endif //_PAIRINGWORKINGHOURFOREVAFDRULEPARAM_H_
