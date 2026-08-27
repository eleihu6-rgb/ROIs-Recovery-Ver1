#pragma once
#ifndef _CHECKRENEWCERTINADVANCEFOREVAFDRULEPARAM_H
#define _CHECKRENEWCERTINADVANCEFOREVAFDRULEPARAM_H
#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/InExMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "matcher/TrainingCourseCodeMatchExpression.h"
#include "matcher/NumericRangeMatchExpression.h"

class CheckRenewCertInAdvanceForEvaFdRuleParam;

class CheckRenewCertInAdvanceForEvaFdRuleParam : public RuleParam {
	friend class CheckRenewCertInAdvanceForEvaFdRule;
private:
	explicit CheckRenewCertInAdvanceForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7231;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 12;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		CERTIFICATE_TYPES = 4,
		ASSIGNMENT = 5,
		COURSE_CODES = 6,
		SKIP_HOLIDAY = 7,
		HOLIDAY_COUNTRIES = 8,
		RENEWAL_WINDOW = 9,
		TYPE = 10,
		SEVERITY = 11
	};

	//所属基地。多个值使用“|”分隔并支持*通配
	vector<string> _bases{};
	//人员级别。多个值使用“|”分隔并支持*通配
	vector<string> _ranks{};
	//人员机型。多个值使用“|”分隔并支持*通配
	vector<string> _fleets{};
	//团队。多个值使用“|”分隔并支持*通配
	vector<string> _teams{};

	//证件类型。多个值使用“|”分隔并支持*通配
	std::string _certificateTypes;
	SimpleInExMatchExpression _certificateTypesMatch;

	//地面任务类型或者Segment任务类型。
	std::string _assignments;
	AssignmentMatchExpression<Activity> _assignmentsMatch;
	
	//当前排课的培训课程代码。格式：A|B|C 或者 !(A|B|C) 或 *，使用“|”分隔多个值。*通配表示忽略该参数
	std::string _courseCodes{};
	TrainingCourseCodeMatchExpression<Activity> _courseCodeMatch;
	
	//是否避开holiday。取值：Y - 包含（是），N-不包含（否）
	bool _isSkipHoliday{false};
	
	//休假日国家列表。多个值使用“|”分隔并支持*通配
	string _holidayCountries{};
	SimpleInExMatchExpression _holidayCountriesMatch;

	//资质过期前重新更新时间窗口(天数)。格式：n-m，表示[n,m]左闭右闭。
	std::string _renewalWindow{};
	int _renewalWindowLower = 0;
	int _renewalWindowUpper = 0;

	//类型。取值：WD-每周工作日，WE-每周周末。多个值使用“|”分隔并支持*通配(表示WD)
	std::string _strTypes;
	set<std::string> _types{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	bool MatchAssignment(const ROSTER* roster) const;

	//true:crew是TE角色，false:crew不是TE角色
	bool MatchTrainingRole(const ROSTER* roster, const Segment* segment) const;
public:

	bool MatchCertificate(const std::shared_ptr<CREW_QUALIFICATION>& certificate, const time_t checkedStartTime, const time_t checkedEndTime) const;

	bool MatchParam(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

	bool MatchParam(const Segment* segment, const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

	//检查安排任务是否是国家法定节假日，true:安排在非法定节假日，否则 fales
	bool CheckHoliday(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;
	bool CheckHoliday(const Segment* segment, const std::shared_ptr<CREW>& crew) const;
	bool CheckHoliday(const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW>& crew) const;


	//检查安排任务是否必须安排在每周工作日，true:允许安排在工作日，否则 fales
	bool CheckWeekDay(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;
	bool CheckWeekDay(const Segment* segment, const std::shared_ptr<CREW>& crew) const;
	bool CheckWeekDay(const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW>& crew) const;

	//是否无任务
	bool CheckNoAssignment(const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew) const;

};

#endif // _CHECKRENEWCERTINADVANCEFOREVAFDRULEPARAM_H
