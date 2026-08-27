#ifndef _INHERITABLEInheritableThreadLocal_H_
#define _INHERITABLEInheritableThreadLocal_H_
#include <string>
#include <vector>
#include <mutex>
#include <shared_mutex>
#include <assert.h>
#include <thread>

/*
* 线程本地变量支持主线程按值传递方式，将变量值传递给子线程。但子线程修改不会修改主线程
* InheritableThreadLocal变量必须初始化，否则可能会报空指针异常。
* 例如： InheritableThreadLocal<unsigned int> _minRest = 1;
*/
template <class T>
class InheritableThreadLocal {
private:

	struct ElementWrapper {

		void set(std::unique_ptr<T> p) {
			if (!p) {
				return;
			}
			_ptr = std::move(p);
		}

		std::unique_ptr<T>& get() const {
			return _ptr;
		}

		void setId(const std::size_t id) {
			_id = id;
		}

		std::size_t getId() const {
			return _id;
		}

		void release() {
			if (_ptr != nullptr) {
				_ptr.reset();
			}
		}

		mutable std::unique_ptr<T> _ptr;

		std::size_t _id;
	};

	struct ThreadEntry {
		std::vector<std::unique_ptr<ElementWrapper>> elements;

		std::thread::id tid() {
			return std::this_thread::get_id();
		}
	};

public:
	InheritableThreadLocal() : _id() {
		_mainThrId = std::this_thread::get_id();
		_id = _count;
	}

	InheritableThreadLocal(T value) : _id() {
		_mainThrId = std::this_thread::get_id();
		_id = _count;
		set(value);
	}

	InheritableThreadLocal(const InheritableThreadLocal& other) {
		_mainThrId = std::this_thread::get_id();
		_id = _count;
		this->set(other.get());
	}

	InheritableThreadLocal& operator=(const InheritableThreadLocal& other) {
		this->set(other.get());
		return *this;
	}

	InheritableThreadLocal(InheritableThreadLocal&& other) noexcept : _id(std::move(other._id)),
		_mainThrId(std::move(other._mainThrId)), _mainPtr(std::move(other._mainPtr)) {}

	InheritableThreadLocal& operator=(InheritableThreadLocal&& other) {
		assert(this != &other);
		_id = std::move(other._id);
		_mainThrId = std::move(other._mainThrId);
		_mainPtr = std::move(other._mainPtr);
		return *this;
	}

	~InheritableThreadLocal() {  }

	T& get() const {
		std::shared_lock<std::shared_mutex> lock(_mutex);//读锁
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		return *(static_cast<T*>(elementWrapper->get().get()));
	}

	T& operator->() const { return get(); }

	void release() {
		std::unique_lock<std::shared_mutex> lock(_mutex);//写锁
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		elementWrapper.reset();
	}

	void set(T newValue) {
		std::unique_lock<std::shared_mutex> lock(_mutex);//写锁

		std::thread::id thrId = std::this_thread::get_id();
		if (thrId == _mainThrId) {
			//主线程存储变量
			_mainPtr = std::make_unique<T>(newValue);
		}

		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		elementWrapper->release();
		elementWrapper->set(std::make_unique<T>(newValue));
		_id = elementWrapper->getId();
	}

	explicit operator bool() const {
		std::shared_lock<std::shared_mutex> lock(_mutex);//读锁
		std::unique_ptr<ElementWrapper>& elementWrapper = getById(_id);
		auto value = static_cast<T*>(elementWrapper->get().get());
		return value != nullptr;
	}

	std::size_t getId() const {
		return _id;
	}
private:

	std::unique_ptr<ElementWrapper>& getById(const std::size_t id) const {
		static thread_local ThreadEntry threadEntry;
		if ( id >= threadEntry.elements.size()) {
			for (std::size_t index = threadEntry.elements.size(); index <=id; index++) {
				threadEntry.elements.push_back(std::make_unique<ElementWrapper>());
			}
		}
		std::unique_ptr<ElementWrapper>& elementWrapper = threadEntry.elements[id];
		if (elementWrapper->get().get() == nullptr) {
			elementWrapper->setId(id);
			std::thread::id thrId = std::this_thread::get_id();
			if (thrId != _mainThrId) {
				//主线程变量赋值到子线程
				elementWrapper->set(std::make_unique<T>(*_mainPtr));
			}
			else {
				elementWrapper->set(std::make_unique<T>());
			}
		}

		_count = threadEntry.elements.size();
		return threadEntry.elements[id];;
	}

	mutable std::unique_ptr<T> _mainPtr;

	mutable std::thread::id _mainThrId;

	mutable std::shared_mutex _mutex;

	mutable std::size_t _id{};

	static thread_local std::size_t _count;
};

template <class T>
thread_local std::size_t InheritableThreadLocal<T>::_count = 0;

#endif //_INHERITABLEInheritableThreadLocal_H_