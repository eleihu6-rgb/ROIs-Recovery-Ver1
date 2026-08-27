/**
 * @file LimitProgramCourseOnFlightForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULEPARAM_H_
#define _LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/BoolMatchExpression.h"

class LimitProgramCourseOnFlightForEvaFdRule;

class LimitProgramCourseOnFlightForEvaFdRuleParam : public RuleParam {
	friend class LimitProgramCourseOnFlightForEvaFdRule;
private:
    explicit LimitProgramCourseOnFlightForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7244;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		COURSE_TYPE = 4,
		CREW_FLEETS = 5,
		CREW_A_COURSE_CODES = 6,
		CREW_B_PROHIBITED_COURSE_CODES = 7,
		CREW_B_PROHIBITED_FOOTPRINT_TYPES = 8,
		SEVERITY = 9
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//课程类型。取值：LINE、GROUND、SIM
	std::string _courseType{};
	SimpleInExMatchExpression _courseTypeMatch;

	//Crew A和Crew B所属机队。格式：A|B|C，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _crewFleet{};
	std::vector<std::string> _crewFleets{};
	
	//Crew A训练课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _crewACourseCodes{};
	SimpleInExMatchExpression _crewACourseCodesMatch;

	//Crew B禁止训练课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _prohibitedCourseCodes{};
	SimpleInExMatchExpression _prohibitedCourseCodesMatch;

	//Crew B禁止大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _prohibitedFootprintTypes{};
	SimpleInExMatchExpression _prohibitedFootprintTypesMatch;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断机组人员所属机型机队是否满足
	bool MatchCrewFleets(std::shared_ptr<CREW> crew, const std::shared_ptr<TmProgramCourse>& programCourse) const;

	//匹配机组人员所有的培训计划的状态
	bool MatchProgramStatusAndFootprintType(const ROSTER& roster) const;
	bool MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		FOOTPRINT_WARN = 1, //Footprint Type不满足告警
		COURSE_CODE_WARN = 2 //Course Code不满足告警
	};

	bool MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<CREW>& crew) const;

	bool MatchParam(const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<TmCourse>& cofCourse) const;

	int CheckParam(const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<TmCourse>& cofCourse, const std::shared_ptr<TmFootprint>& cofFootprint) const;
};

#endif //_LIMITPROGRAMCOURSEONFLIGHTFOREVAFDRULEPARAM_H_
