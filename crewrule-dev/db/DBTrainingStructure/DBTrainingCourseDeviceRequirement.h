//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENT_H


class DBTrainingCourseDeviceRequirement {
public:
    DBTrainingCourseDeviceRequirement(long long id, long long courseId, size_t priority) : _courseId(
            courseId), _id(id), _priority(priority) {}

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    const size_t GetPriority() const { return _priority; }

    void SetPriority(size_t priority) { _priority = priority; }

private:
    long long _id;
    long long _courseId;
    size_t _priority;           //To let TO assign the course to more desirable device if possible, different device requirements can have same priority
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENT_H
