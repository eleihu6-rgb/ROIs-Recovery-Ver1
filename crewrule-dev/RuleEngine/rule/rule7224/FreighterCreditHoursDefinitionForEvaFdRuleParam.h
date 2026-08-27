/**
 * @file FreighterCreditHoursDefinitionForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _FREIGHTERCREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_
#define _FREIGHTERCREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_

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
#include "matcher/IPOrCKQualMatchExpression.h"
#include "matcher/TrainingChiefPilotRankMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"
#include "matcher/BoolMatchExpression.h"

#include <string>
#include <limits>

class CalculateFreighterCreditHoursInMandayForEvaFdRule;


class FreighterCreditHoursDefinitionForEvaFdRuleParam : public RuleParam {
friend class CalculateFreighterCreditHoursInMandayForEvaFdRule;
private:
    explicit FreighterCreditHoursDefinitionForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7224;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 20;

    enum class ParamLocation {
		TEAMS = 0,
		ASSIGNMENT_GROUPS = 1,
		ASSIGNMENTS = 2,
		SEGMENT_FLEETS = 3,
		SEGMENT_FROM_DEP_TO_ARR = 4,
		NUMBER_RANGE_OF_SEGMENT_IN_DUTY = 5,
		IP_CK_CHIEF_PILOT_CREDIT = 6,
		FOOTPRINT_TYPE = 7,
		COURSE_CODE = 8,
		EXTRA_COURSE = 9,
		ROLE = 10,
		IP_CK_QUAL = 11,
		CHIEF_PILOT_RANK = 12,
		CREDIT = 13,
		CREDIT_BT_GAP = 14,
		PERCENT = 15,
		DELAY_BUFFER = 16,
		MULTIPLE = 17,
		SPLIT_METHOD = 18,
		SEVERITY = 19
    };

	//团队,多个值使用“|”分隔并支持*通配
	vector<std::string> _teams{};

	//Roster的任务组(飞行Roster或地面Roster的任务组)。多个值使用“|”分隔并支持*通配
	std::string _assignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _assignmentGroupsMatch;

	//Ground Roster/Segment的任务类型,多个值使用“|”分隔并支持*通配
	std::string _assignments{};
	AssignmentMatchExpression<Activity> _assignmentMatch;

	//航班机型。多个值使用“|”分隔并支持*通配
	std::string _segmentFleets;
	SimpleInExMatchExpression _segmentFleetsMatch;

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

	//大纲类型。多个值使用“|”分隔并支持*通配
	std::string _footprintTypes;
	SimpleInExMatchExpression _footprintTypesMatch;

	//课程编号,格式：A|B|C 或者 !(A|B|C) 或 *。使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;

	//是否加课，取值：Y/N。*表示未设置。
	std::string _isExtraCourse;
	BoolMatchExpression _isExtraCourseMatch;

	//训练角色
	std::string _trainRoles{};
	TrainingRoleMatchExpression<Activity> _trainingRoleMatch;

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

	//匹配FootprintType和ExtraCourse
	bool MatchFootprintTypeAndExtraCourse(const ROSTER& roster, const Segment* segment, const int offsetTZMinutes) const;
	bool MatchFootprintTypeAndExtraCourse(const std::shared_ptr<TmProgramCourse>& teProgramCourse, const Segment* segment, const int offsetTZMinutes) const;

	//匹配FootprintType和Program.FirstDutyDate
	bool MatchFootprintTypeAndFirstDutyDate(const ROSTER& roster, const Segment* segment, const vector<std::shared_ptr<TmProgram>>& allProgramList, const int offsetTZMinutes) const;

public:

	//匹配参数
	bool MatchParam(const ROSTER* roster, const Duty* duty, const Segment* segment, const vector<std::shared_ptr<TmProgram>>& allProgramList, const int offsetTZMinutes) const;

};

#endif //_FREIGHTERCREDITHOURSDEFINITIONFOREVAFDRULEPARAM_H_
