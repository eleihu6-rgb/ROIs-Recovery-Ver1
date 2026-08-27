#pragma once

#include <tuple>
#include "CrewDB.h"

class TmCourseBriefIndex {
public:
	TmCourseBriefIndex(const vector<std::shared_ptr<TmCourseBrief>>& tmCourseBriefList);

	const std::shared_ptr<TmCourseBrief> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseBrief>> getByCourseId(const long long courseId) const;

	/*
	* 获得课程的签到和签出时长(分钟数)
	* @param courseId课程ID
	* @param role 角色
	* @return tuple<brief时长,debrief时长> 若没有brief/debrief配置则为-1
	*/
	const std::tuple<int, int> getCourseBriefAndDebrief(const long long courseId, const string& role) const;

private:
	map<long long, std::shared_ptr<TmCourseBrief>> _idIndex; //<id, TmCourseBrief>
	unordered_multimap<long long, std::shared_ptr<TmCourseBrief>> _courseIdIndex; //<courseId, TmCourseBrief>

	void makeIndex(const vector<std::shared_ptr<TmCourseBrief>>& tmCourseBriefList);
};


class TmCourseDurationIndex {
public:
	TmCourseDurationIndex(const vector<std::shared_ptr<TmCourseDuration>>& tmCourseDurationList);

	const std::shared_ptr<TmCourseDuration> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseDuration>> getByCourseId(const long long courseId) const;

private:
	map<long long, std::shared_ptr<TmCourseDuration>> _idIndex; //<id, TmCourseDuration>
	unordered_multimap<long long, std::shared_ptr<TmCourseDuration>> _courseIdIndex; //<courseId, TmCourseDuration>

	void makeIndex(const vector<std::shared_ptr<TmCourseDuration>>& tmCourseDurationList);
};


class TmCourseRoleIndex {
public:
	TmCourseRoleIndex(const vector<std::shared_ptr<TmCourseRole>>& tmCourseRoleList);

	const std::shared_ptr<TmCourseRole> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseRole>> getByCourseId(const long long courseId) const;

private:
	map<long long, std::shared_ptr<TmCourseRole>> _idIndex; //<id, TmCourseRole>
	unordered_multimap<long long, std::shared_ptr<TmCourseRole>> _courseIdIndex; //<courseId, TmCourseRole>

	void makeIndex(const vector<std::shared_ptr<TmCourseRole>>& tmCourseRoleList);
};

class TmCourseRoleBaseIndex {
public:
	TmCourseRoleBaseIndex(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList);

	const std::shared_ptr<TmCourseRoleBase> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseRoleBase>> getByCourseRoleId(const long long tmCourseRoleId) const;
private:
	map<long long, std::shared_ptr<TmCourseRoleBase>> _idIndex; //<id, TmCourseRoleBase>
	unordered_multimap<long long, std::shared_ptr<TmCourseRoleBase>> _courseRoleIdIndex; //<tmCourseRoleId, TmCourseRoleBase>

	void makeIndex(const vector<std::shared_ptr<TmCourseRoleBase>>& tmCourseRoleBaseList);
};

class TmCourseRoleQualIndex {
public:
	TmCourseRoleQualIndex(const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList);

	const std::shared_ptr<TmCourseRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseRoleQual>> getByCourseRoleId(const long long tmCourseRoleId) const;

	const vector<std::shared_ptr<TmCourseRoleQual>> getByCourseRoleBaseId(const long long tmCourseRoleBaseId) const;
private:
	map<long long, std::shared_ptr<TmCourseRoleQual>> _idIndex; //<id, TmCourseRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmCourseRoleQual>> _courseRoleIdIndex; //<tmCourseRoleId, TmCourseRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmCourseRoleQual>> _courseRoleBaseIdIndex; //<tmCourseRoleBaseId, TmCourseRoleQual>

	void makeIndex(const vector<std::shared_ptr<TmCourseRoleQual>>& tmCourseRoleQualList);
};

class TmCourseRoleDeviceIndex {
public:
	TmCourseRoleDeviceIndex(const vector<std::shared_ptr<TmCourseRoleDevice>>& tmCourseRoleDeviceList);

	const std::shared_ptr<TmCourseRoleDevice> getById(const long long id) const;

	const vector<std::shared_ptr<TmCourseRoleDevice>> getByCourseRoleId(const long long tmCourseRoleId) const;

	const vector<std::shared_ptr<TmCourseRoleDevice>> getByCourseRoleBaseId(const long long tmCourseRoleBaseId) const;
private:
	map<long long, std::shared_ptr<TmCourseRoleDevice>> _idIndex; //<id, TmCourseRoleDevice>
	unordered_multimap<long long, std::shared_ptr<TmCourseRoleDevice>> _courseRoleIdIndex; //<tmCourseRoleId, TmCourseRoleDevice>
	unordered_multimap<long long, std::shared_ptr<TmCourseRoleDevice>> _courseRoleBaseIdIndex; //<tmCourseRoleBaseId, TmCourseRoleDevice>

	void makeIndex(const vector<std::shared_ptr<TmCourseRoleDevice>>& tmCourseRoleDeviceList);
};
