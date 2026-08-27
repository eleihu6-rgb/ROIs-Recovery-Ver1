/**
 * @file CreditHoursDefinitionForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_
#define _CREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include "RuleParams.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingCreditFlagMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"
#include "matcher/TrainingAssignmentRoleMatchExpression.h"
#include "matcher/IPOrCKQualMatchExpression.h"
#include "matcher/TrainingChiefPilotRankMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

#include <string>
#include <limits>

class CalculateCreditHoursInMandayForEvaFdRule;


class CreditHoursDefinitionForEvaFdRuleParam : public RuleParam {
friend class CalculateCreditHoursInMandayForEvaFdRule;
private:
    explicit CreditHoursDefinitionForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7215;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 19;

    enum class ParamLocation {
		TEAMS = 0,
		ASSIGNMENT_GROUPS = 1,
		ASSIGNMENTS = 2,
		SEGMENT_FROM_DEP_TO_ARR = 3,
		NUMBER_RANGE_OF_SEGMENT_IN_DUTY = 4,
		IP_CK_CHIEF_PILOT_CREDIT = 5,
		FOOTPRINT_SUB_TYPES = 6,
		COURSE_CODE = 7,
		ROLE = 8,
		ROLE_IN_ROSTER = 9,
		IP_CK_QUAL = 10,
		CHIEF_PILOT_RANK = 11,
		CREDIT = 12,
		CREDIT_BT_GAP = 13,
		PERCENT = 14,
		DELAY_BUFFER = 15,
		MULTIPLE = 16,
		SPLIT_METHOD = 17,
		SEVERITY = 18
    };

	//团队,多个值使用“|”分隔并支持*通配
	vector<std::string> _teams{};

	//Roster的任务组(飞行Roster或地面Roster的任务组)。多个值使用“|”分隔并支持*通配
	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//Ground Roster/Segment的任务类型,多个值使用“|”分隔并支持*通配
	std::string _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//Segment的出发地点和到达地点参数，举例：TPE-TNN
	std::string _segFromDepToArr{};
	vector<std::string> _segDeps{};//出发地点列表
	vector<std::string> _segArrs{};//到达地点列表

	//Duty的Segment数量范围。格式：n-m，表示[n,m]左闭右闭。*通配表示忽略该参数
	std::string _numRangeOfSegment{};
	NumericRangeMatchExpression _numRangeOfSegmentMatch;

	//校验roster的assignment或course code是否参与‘教员/检查员&总机长 计薪时间’的计算,取值：Y/N。*表示未设置。
	std::unique_ptr<bool> _tmCreditFlag{nullptr};
	TrainingCreditFlagMatchExpression<Activity> _tmCreditFlagMatch;

	//人员所有计划课程的课程大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint subtype字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'的子节点
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;

	//课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;

	//航班的训练角色
	std::string _trainRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRoleMatch;

	//在本次排班Roster中包含的训练角色（多个航段，某个包含即可），格式：ASSIGNMENT+ROLE 或 ROLE，多个使用|分隔。例如：GND+IP|OW+*
	std::string _trainRolesInRoster{};
	TrainingAssignmentRoleMatchExpression<Activity> _trainingRoleInRosterMatch;

	//教员/检查员资质,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _IPOrCKQuals{};
	IPOrCKQualMatchExpression<Activity> _IPOrCKQualMatch;

	//是否总机长级别,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _chiefPilotRanks{};
	TrainingChiefPilotRankMatchExpression<Activity> _chiefPilotRankMatch;
	
	//计薪时间计算公式,取值：BT-飞时（即：BLH、BH）,AGH-guarantee hour每日平均值，GND-地面任务计划
	std::string _creditExpression{};
	
	//计薪时间飞时偏差值,格式：HH:mm
	std::string _creditBtGap{};
	int _creditBtGapMinutes{};
	
	//计薪时间折算比例,
	double _creditPercent{};
	
	//计薪时间航班延误阈值,格式：HH:mm
	std::string _creditDelayBuffer{};
	int _creditDelayBufferMinutes{};
	
	//计薪加成
	double _creditMultiple{};

	//跨天分隔时长方式。取值：SPAN -按时间跨度进行切分，START - 划分到开始时间所在日期。默认值*表示不配置则为：SPAN
	string _splitMethod{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配航段的出发地点和到达地点
	bool MatchSegmentFromDepToArr(const Segment* segment) const;

	bool MatchFootprintSubType(const ROSTER* roster, const Segment* segment) const;
public:

	//匹配参数
	bool MatchParam(const Duty* duty, const Segment* segment) const;

	//匹配参数
	bool MatchParam(const ROSTER* roster, const Duty* duty, const Segment* segment) const;

	//匹配参数
	bool MatchParam(const SharedPtr<MandayActivity>& mandayActivity) const;

	//匹配参数
	bool MatchAssignmentAndGroup(const SharedPtr<MandayActivity>& mandayActivity) const;

};

#endif //_CREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_
