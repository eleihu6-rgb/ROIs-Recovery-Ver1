/**
 * @file LimitULROnTrainingForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-14
**/

#ifndef _LIMITULRONTRAININGFOREVAFDRULEPARAM_H_
#define _LIMITULRONTRAININGFOREVAFDRULEPARAM_H_

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

class LimitULROnTrainingForEvaFdRule;

class LimitULROnTrainingForEvaFdRuleParam : public RuleParam {
	friend class LimitULROnTrainingForEvaFdRule;
private:
    explicit LimitULROnTrainingForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7279;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

	enum class ParamLocation {
		FOOTPRINT_TYPES = 0,
		FOOTPRINT_SUB_TYPES = 1,
		IOE_PHASE = 2,
		COURSE_CODES = 3,
		ROUTES = 4,
		SEVERITY = 5
	};

	//训练课程大纲类型列表，过滤参数。多个使用|分割，支持*表示所有
	std::string _footprintTypes;
	SimpleInExMatchExpression _footprintTypeMatch;

	//训练课程大纲子类型列表，过滤参数。多个使用|分割，支持*表示所有
	std::string _footprintSubtypes{};
	SimpleInExMatchExpression _footprintSubtypesMatch;

	//IOE阶段，过滤参数。多个使用|分割，支持*表示所有。
	std::string _strIOEPhases{};
	std::vector<std::string> _ioePhases{};

	//训练课程代码列表，过滤参数。多个使用|分割，支持*表示所有
	string _strCourseCodes{};
	std::vector<std::string> _courseCodes{};

	//URL航线的Attribute列表，过滤参数。多个使用|分割，支持*表示所有
	std::string _strRouteAttributes{};
	std::vector<std::string> _routeAttributes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchFootprintType(const std::shared_ptr<TmProgram>& tmProgram) const;

	bool MatchIOEPhase(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const;

	bool MatchCourseCode(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const;

public:
	bool MatchParam(const std::shared_ptr<TmProgram>& tmProgram, const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const;

	std::vector<std::string> MatchRoutes(const Segment* segment) const;
};

#endif //_LIMITULRONTRAININGFOREVAFDRULEPARAM_H_
