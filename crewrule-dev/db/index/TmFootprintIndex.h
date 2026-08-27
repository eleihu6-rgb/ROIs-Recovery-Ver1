#pragma once

#include "CrewDB.h"

class TmFootprintIndex {
public:
	TmFootprintIndex(const vector<std::shared_ptr<TmFootprint>>& tmFootprintList);

	const std::shared_ptr<TmFootprint> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprint>> getChildrenByParentId(const long long parentId) const;

private:
	map<long long, std::shared_ptr<TmFootprint>> _idIndex; //<id, TmFootprint>
	unordered_multimap<long long, std::shared_ptr<TmFootprint>> _parentIdIndex; //<parentId, TmFootprint>

	void makeIndex(const vector<std::shared_ptr<TmFootprint>>& tmFootprintList);
};


class TmFootprintCourseIndex {
public:
	TmFootprintCourseIndex(const vector<std::shared_ptr<TmFootprintCourse>>& tmFootprintCourseList);

	const std::shared_ptr<TmFootprintCourse> getById(const long long id) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourse>> _idIndex; //<id, TmFootprintCourse>

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourse>>& tmFootprintCourseList);
};

class TmFootprintCourseTraineeIndex {
public:
	TmFootprintCourseTraineeIndex(const vector<std::shared_ptr<TmFootprintCourseTrainee>>& tmFootprintCourseTraineeList);

	const std::shared_ptr<TmFootprintCourseTrainee> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprintCourseTrainee>> getByFootprintCourseId(const long long footprintCourseId) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseTrainee>> _idIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseTrainee>> _footprintCourseIdIndex;

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseTrainee>>& tmFootprintCourseTraineeList);
};

class TmFootprintCourseSectorIndex {
public:
	TmFootprintCourseSectorIndex(const vector<std::shared_ptr<TmFootprintCourseSector>>& tmFootprintCourseSectorList);

	const std::shared_ptr<TmFootprintCourseSector> getById(const long long id) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseSector>> _idIndex; //<id, TmFootprintCourseSector>

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseSector>>& tmFootprintCourseSectorList);
};

class TmFootprintCourseIpRoleIndex {
public:
	TmFootprintCourseIpRoleIndex(const vector<std::shared_ptr<TmFootprintCourseIpRole>>& tmFootprintCourseIpRoleList);

	const std::shared_ptr<TmFootprintCourseIpRole> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprintCourseIpRole>> getByFootprintCourseId(const long long footprintCourseId) const;

	const vector<std::shared_ptr<TmFootprintCourseIpRole>> getByFootprintTraineeId(const long long footprintTraineeId) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseIpRole>> _idIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseIpRole>> _footprintCourseIdIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseIpRole>> _footprintTraineeIdIndex;

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRole>>& tmFootprintCourseIpRoleList);
};

class TmFootprintCourseIpRoleBaseIndex {
public:
	TmFootprintCourseIpRoleBaseIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>>& tmFootprintCourseIpRoleBaseList);

	const std::shared_ptr<TmFootprintCourseIpRoleBase> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>> getByFootprintCourseIpRoleId(const long long footprintCourseIpRoleId) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseIpRoleBase>> _idIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseIpRoleBase>> _footprintCourseIpRoleIdIndex;

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleBase>>& tmFootprintCourseIpRoleBaseList);
};

class TmFootprintCourseIpRoleQualIndex {
public:
	TmFootprintCourseIpRoleQualIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>>& tmFootprintCourseIpRoleQualList);

	const std::shared_ptr<TmFootprintCourseIpRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>> getByFootprintCourseIpRoleBaseId(const long long footprintCourseIpRoleBaseId) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseIpRoleQual>> _idIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseIpRoleQual>> _footprintCourseIpRoleBaseIdIndex;

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseIpRoleQual>>& tmFootprintCourseIpRoleQualList);
};

class TmFootprintCourseRoleIndex {
public:
	TmFootprintCourseRoleIndex(const vector<std::shared_ptr<TmFootprintCourseRole>>& tmFootprintCourseRoleList);

	const std::shared_ptr<TmFootprintCourseRole> getById(const long long id) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseRole>> _idIndex; //<id, TmFootprintCourseRole>

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseRole>>& tmFootprintCourseRoleList);
};

class TmFootprintCourseRoleQualIndex {
public:
	TmFootprintCourseRoleQualIndex(const vector<std::shared_ptr<TmFootprintCourseRoleQual>>& tmFootprintCourseRoleQualList);

	const std::shared_ptr<TmFootprintCourseRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmFootprintCourseRoleQual>> getByFootprintCourseRoleId(const long long footprintCourseRoleId) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseRoleQual>> _idIndex;
	unordered_multimap<long long, std::shared_ptr<TmFootprintCourseRoleQual>> _footprintCourseRoleIdIndex;

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseRoleQual>>& tmFootprintCourseRoleQualList);
};


class TmFootprintCourseRoleLimitationIndex {
public:
	TmFootprintCourseRoleLimitationIndex(const vector<std::shared_ptr<TmFootprintCourseRoleLimitation>>& tmFootprintCourseRoleLimitationList);

	const std::shared_ptr<TmFootprintCourseRoleLimitation> getById(const long long id) const;

private:
	map<long long, std::shared_ptr<TmFootprintCourseRoleLimitation>> _idIndex; //<id, TmFootprintCourseRoleLimitation>

	void makeIndex(const vector<std::shared_ptr<TmFootprintCourseRoleLimitation>>& tmFootprintCourseRoleLimitationList);
};