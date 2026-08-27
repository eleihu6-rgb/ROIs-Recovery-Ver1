/**
 * @file LimitInexpCrewForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITINEXPCREWFOREVAFDRULEPARAM_H_
#define _LIMITINEXPCREWFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/TrainingRoleMatchExpression.h"

class LimitInexpCrewForEvaFdRule;

class LimitInexpCrewForEvaFdRuleParam : public RuleParam {
	friend class LimitInexpCrewForEvaFdRule;
private:
    explicit LimitInexpCrewForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7262;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		ACTING_RANKS = 0,
		DAYS_AFTER_FIRST_DUTY = 1,
		PROGRAM_STATUSES = 2,
		FOOTPRINT_TYPE = 3,
		FOOTPRINT_SUBTYPES = 4,
		MAX_NUMBER_OF_INEXPERIENCED_CREW = 5,
		SEVERITY = 6
    };

	//机上岗位。多个值使用“|”分隔并支持*通配
	string _actingRanks{};
	SimpleInExMatchExpression _actingRanksMatch;

	//首个duty后（Check out后）天数。配置*忽略该参数
	std::shared_ptr<int> _daysAfterFirstDuty{nullptr};
	
	//训练计划大纲类型，配置*表示忽略。
	//footprint type字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'
	std::string _footprintType{};
	SimpleInExMatchExpression _footprintTypeMatch;
	
	//训练计划大纲子类型。多个值使用“|”分隔并支持*通配
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;
	
	//人员所有计划课程的状态，格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值
	//program状态取值："Not Scheduled"、"Partially Scheduled"、"Scheduled"、"Completed"、"Manual End"
	std::string _programStatuses;
	SimpleInExMatchExpression _programStatusMatch;

	//最多N位菜鸟人数。
	int _maxNumOfCrew{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//若小于_daysAfterFirstDuty ,则返回true，满足菜鸟匹配条件；
	bool MatchDaysAfterFirstDuty(const Segment* segment, const std::shared_ptr<CrewOnFlight>& cof) const;

	//匹配机组人员所有的培训计划的状态
	bool MatchProgramStatusAndFootprintType(const std::shared_ptr<CrewOnFlight>& cof) const;
	bool MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;

public:

	bool MatchParam(const Segment* segment, const std::shared_ptr<CrewOnFlight>& cof) const;

};

#endif //_LIMITINEXPCREWFOREVAFDRULEPARAM_H_
