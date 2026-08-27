/**
 * @file LimitSameDeviceInProgramForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITSAMEDEVICEINPROGRAMFOREVAFDRULEPARAM_H_
#define _LIMITSAMEDEVICEINPROGRAMFOREVAFDRULEPARAM_H_

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

class LimitSameDeviceInProgramForEvaFdRule;

class LimitSameDeviceInProgramForEvaFdRuleParam : public RuleParam {
	friend class LimitSameDeviceInProgramForEvaFdRule;
private:
    explicit LimitSameDeviceInProgramForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7246;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CREW_FLEETS = 4,
		FOOTPRINT_TYPES = 5,
		COURSE_CODES = 6,
		DEVICE_GROUPS = 7,
		SEVERITY = 8
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
	//footprint type字典数据来自TM_TRAINING_CONFIG表CATEGORY='FOOTPRINT_TYPE'
	std::string _footprintTypes{};
	SimpleInExMatchExpression _footprintTypesMatch;

	//训练课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _courseCodes{};
	SimpleInExMatchExpression _courseCodesMatch;

	//课程设备组。格式：A|B|C，使用“|”或“$”分隔多个值。“|”表示所有课程使用的设备满足设备组列表中任何一个设备组即可，“$”表示所有课程使用的设备必须同时在设备组列表内某个设备组内。
	// 若配置*通配表示训练课程Course Codes只能在同一种设备上。若指定Device Types，则必须在指定设备类型上课
	std::string _strDeviceGroups{};
	vector<std::string> _anyOfDeviceGroups{};//分隔符为 | 的设备组列表
	vector<std::string> _mustOneOfDeviceGroups{};//分隔符为 $ 或者 没有分隔符的设备组列表
	
    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;


	//判断机组人员所属机型机队是否满足
	bool MatchCrewFleets(std::shared_ptr<CREW> crew, const std::shared_ptr<TmProgramCourse>& programCourse) const;

public:

	bool MatchFootprintType(const std::shared_ptr<TmFootprint>& tmFootprint) const;

	bool MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CREW>& crew) const;

	bool CheckParam(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB) const;
};

#endif //_LIMITSAMEDEVICEINPROGRAMFOREVAFDRULEPARAM_H_
