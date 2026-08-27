/**
 * @file RequiredMinNumOfCourseForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _REQUIREDMINNUMOFCOURSEFOREVAFDRULEPARAM_H_
#define _REQUIREDMINNUMOFCOURSEFOREVAFDRULEPARAM_H_

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

class RequiredMinNumOfCourseForEvaFdRule;

class RequiredMinNumOfCourseForEvaFdRuleParam : public RuleParam {
	friend class RequiredMinNumOfCourseForEvaFdRule;
private:
    explicit RequiredMinNumOfCourseForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7249;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CREW_FLEETS = 4,
		FOOTPRINT_SUB_TYPES = 5,
		COURSE_CODES = 6,
		BEGIN_REFERENCE_TIME = 7,
		END_REFERENCE_TIME = 8,
		BEGIN_DAY = 9,
		END_DAY = 10,
		PERIOD = 11,
		UNIT = 12,
		MIN_LIMITS_OF_COURSE = 13,
		SEVERITY = 14
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};
	
	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};
	
	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};
	
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};
	
	//Crew所属机队。格式：A|B|C，使用“|”分隔多个值，*通配表示忽略该参数。
	std::string _crewFleet{};
	std::vector<std::string> _crewFleets{};
	
	//人员所有计划课程的课程大纲类型。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值，*通配表示忽略该参数。
	//footprint subtype字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'的子节点
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;
	
	//训练课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _courseCodes{};
	SimpleInExMatchExpression _courseCodesMatch;
	
	//开始参照基准时间。取值：IOE：IOE第一个安排训练任务开始时间为参照基准时间；FDD：按program first duty date为参照基准时间
	std::string _startReferenceTime{};
	
	//结束参照基准时间。取值：IOE：IOE第一个安排训练任务开始时间为参照基准时间；FDD：按program first duty date为参照基准时间
	std::string _endReferenceTime{};
	
	//开始于第n天(开始参照基准时间)。
	int _beginDay{};
	
	//结束于第m天(结束参照基准时间)。
	int _endDay{};
	
	//周期，仅支持1
	int _period{1};

	//检查时间段类型。取值：M-每月，P-整个时间段
	std::string _unit{};
	
	//最小课程数。
	int _minLimitsOfCourse{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	//判断机组人员所属机型机队是否满足
	bool MatchCrewFleets(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& programCourse) const;

	bool MatchFootprintSubType(const std::shared_ptr<TmFootprint>& tmFootprint) const;

	bool MatchCourseCode(const std::shared_ptr<TmProgramCourse>& programCourse) const;


};

#endif //_REQUIREDMINNUMOFCOURSEFOREVAFDRULEPARAM_H_
