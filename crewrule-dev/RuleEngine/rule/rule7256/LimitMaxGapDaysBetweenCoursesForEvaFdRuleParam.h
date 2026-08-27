/**
 * @file LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULEPARAM_H_
#define _LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULEPARAM_H_

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

class LimitMaxGapDaysBetweenCoursesForEvaFdRule;

class LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam : public RuleParam {
	friend class LimitMaxGapDaysBetweenCoursesForEvaFdRule;
private:
    explicit LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7256;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		COURSE_A_CODES = 4,
		MAX_GAP_DAYS = 5,
		COURSE_B_CODES = 6,
		SEVERITY = 7
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//训练课程A代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _courseACodes{};
	SimpleInExMatchExpression _courseACodesMatch;

	//最大间隔天数
	int _maxGapDays{};

	//训练课程B代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _courseBCodes{};
	SimpleInExMatchExpression _courseBCodesMatch;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:
	bool MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA) const;

	//检查在指定时间段[limitStartTimeUtc,limitEndTimeUtc]是否存在Course B Code
	bool CheckParam(const size_t startIndex, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const time_t limitStartTimeUtc, const time_t limitEndTimeUtc) const;
};

#endif //_LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULEPARAM_H_
