/**
 * @file LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULEPARAM_H_
#define _LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"

class LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule;

class LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam : public RuleParam {
	friend class LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule;
private:
    explicit LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7257;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		COURSE_CODES = 4,
		COURSE_LOCAL_DATES = 5,
		NUMBER_OF_DAYS = 6,
		PEOPLE_NUMBER_RANGE = 7,
		SEVERITY = 8
	};

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//训练课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。
	std::string _courseCodes{};
	SimpleInExMatchExpression _courseCodesMatch;

	//训练课程本地日期,格式：YYYY-MM-DD	使用“ | ”分隔多个值，举例：2025-07-01|2025-07-10
	std::string _strCourseLocalDates;
	std::set<time_t> _courseLocalDates;

	//自然天数
	int _dayNums = 1;

	//学员数量范围,格式：n-m，表示[n,m]
	std::string _peopleNumberRange;
	int _peopleNumberLower = 0;
	int _peopleNumberUpper = 0;
	

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	std::set<long long> GetCourseIds(const string& courseCodes) const;

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchCourseLocalDates(std::set<time_t>& requiredCourseLocalDates, const std::shared_ptr<TmProgramCourse>& programCourse, const int offsetTZMinutes) const;

public:
	//requiredCourseLocalDates: 输出法规检查需要满足条件的本地日期
	bool MatchParam(std::set<time_t>& requiredCourseLocalDates, const std::shared_ptr<TmProgramCourse>& programCourse, const int offsetTZMinutes) const;

	bool CheckParam(const std::set<time_t>& requiredCourseLocalDates, const int offsetTZMinutes) const;
};

#endif //_LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULEPARAM_H_
