/**
 * @file PerDiemHoursForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _PERDIEMHOURSFOREVAFDRULEPARAM_H_
#define _PERDIEMHOURSFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"
#include "matcher/IPOrCKQualMatchExpression.h"
#include "matcher/TrainingChiefPilotRankMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

#include <string>
#include <limits>

class CalculatePerDiemHoursInMandayForEvaFdRule;


class PerDiemHoursForEvaFdRuleParam : public RuleParam {
friend class CalculatePerDiemHoursInMandayForEvaFdRule;
private:
    explicit PerDiemHoursForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7218;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

	enum class ParamLocation {
		PAIRING_ASSIGNMENT_GROUPS = 0,
		DUTY_ASSIGNMENTS = 1,
		OTHER_DUTY_ASSIGNMENTS_IN_PAIRING = 2,
		NUMBER_RANGE_OF_SEGMENT_IN_DUTY = 3,
		FOOTPRINT_SUB_TYPES = 4,
		COURSE_CODE = 5,
		ROLE = 6,
		IP_CK_QUAL = 7,
		CHIEF_PILOT_RANK = 8,
		SEGMENT_SPECIAL_TAG = 9,
		ROLE_IN_ROSTER = 10,
		PER_DIEM = 11,
		PER_DIEM_GAP = 12,
		DELAY_BUFFER = 13,
		SEVERITY = 14
    };

	//Pairing的任务组,多个值使用“|”分隔并支持*通配
	std::string _pairingAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _pairingAssignmentGroupsMatch;

	//Duty的任务类型,多个值使用“|”分隔并支持*通配
	std::string _dutyAssignments{};
	AssignmentMatchExpression<Activity> _dutyAssignmentsMatch;

	//在Pairing中其他Duty的Assignments
	std::string _otherDutyAssignmentsInPairing{};
	AssignmentMatchExpression<Activity> _otherDutyAssignmentsInPairingMatch;

	//Duty的Segment数量范围。格式：n-m，表示[n,m]左闭右闭。*通配表示忽略该参数
	std::string _numRangeOfSegment{};
	NumericRangeMatchExpression _numRangeOfSegmentMatch;

	//人员所有计划课程的课程大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint subtype字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'的子节点
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;

	//课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;

	//训练角色
	std::string _trainRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRoleMatch;

	//c/检查员资质,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _IPOrCKQuals{};
	IPOrCKQualMatchExpression<Activity> _IPOrCKQualMatch;

	//在本次排班Roster中包含的训练角色（多个航段，某个包含即可）
	std::string _trainRolesInRoster{};
	TrainingRoleMatchExpression<Activity> _trainingRoleInRosterMatch;

	//是否总机长级别,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _chiefPilotRanks{};
	TrainingChiefPilotRankMatchExpression<Activity> _chiefPilotRankMatch;
	
	//Segment特殊标签。Duty的Segment拥有该Tag，则整个Duty忽略计算
	std::string _segmentSpecialTag{};

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

private:
	bool MatchOtherDutyAssignments(const Pairing* pairing, const Duty* currDuty) const;

	bool MatchFootprintSubType(const ROSTER* roster, const Duty* duty) const;

	bool MatchFootprintSubType(const ROSTER* roster, const Segment* segment) const;
public:

	//匹配参数
	bool MatchParam(const Pairing* pairing, const Duty* duty, const ROSTER* roster) const;

	////匹配参数
	//bool MatchParam(const ROSTER* roster) const;

	//检查Duty的Segment是否存在Special Tag
	bool ExistSegmentSpecialTag(const ROSTER* roster, const Duty* duty) const;

};

#endif //_PERDIEMHOURSFOREVAFDRULEPARAM_H_
